import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { RemoteImageService } from '../src/images/remote-image.service';
import { OffClient, type OffResult } from '../src/off/off.client';
import { createTestApp } from './create-test-app';
import {
  cookieValue,
  createHousehold,
  createUser,
  HOUSEHOLD,
  ORIGIN,
  ownerPool,
  resetAll,
  seedHousehold,
} from './helpers';

/**
 * The reference scenario of the request (test API, mandatory): an account of household 1 scans a
 * product and puts it in its fridge; an account of household 2 sees it nowhere, and the same goes
 * the other way round. The same barcode gives two independent products and stock lines.
 */
const CODE = '3017620422003';
let app: INestApplication;
let one: string;
let two: string;
let household2: number;
let fetchProduct: MockInstance<OffClient['fetchProduct']>;

const server = () => app.getHttpServer();
const as = (cookie: string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  post: (url: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
});

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

const offCard = (name: string): OffResult => ({
  status: 'found',
  product: {
    name,
    brand: 'Ferrero',
    quantity: '400 g',
    imageUrl: null,
    categoriesTags: ['en:spreads'],
    payload: { product_name: name },
  },
});

async function fridgeOf(cookie: string): Promise<{ id: number; shelf: number }> {
  const res = await as(cookie).get('/api/locations');
  const fridge = res.body.find((l: { kind: string }) => l.kind === 'fridge');
  return { id: fridge.id, shelf: fridge.shelves[0].id };
}

/** Everything household 2 can read, as one text. */
async function everythingSeenBy(cookie: string, productId: number): Promise<string> {
  const reads = await Promise.all([
    as(cookie).get('/api/home'),
    as(cookie).get('/api/locations'),
    as(cookie).get('/api/products'),
    as(cookie).get('/api/products?q=tartiner'),
    as(cookie).get('/api/products?q=nutella'),
    as(cookie).get('/api/stock'),
    as(cookie).get('/api/stock?sort=expiry'),
    as(cookie).get('/api/stock?q=tartiner'),
    as(cookie).get('/api/categories'),
  ]);
  const product = await as(cookie).get(`/api/products/${productId}`);
  const history = await as(cookie).get(`/api/products/${productId}/movements`);
  expect(product.status).toBe(404);
  expect(history.status).toBe(404);
  return JSON.stringify(reads.map((r) => r.body));
}

beforeAll(async () => {
  app = await createTestApp();
  await resetAll();
  await seedHousehold(app);
  household2 = await createHousehold(app, 'Deuxième');
  await createUser(app, { username: 'un', password: 'motdepasse1' });
  await createUser(app, { username: 'deux', password: 'motdepasse1', householdId: household2 });
  one = await login('un');
  two = await login('deux');
  fetchProduct = vi.spyOn(app.get(OffClient), 'fetchProduct');
  vi.spyOn(app.get(RemoteImageService), 'download').mockResolvedValue(null);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe('reference scenario: two households, one barcode', () => {
  let product1: number;
  let product2: number;

  it('household 1 scans a product and puts it in its fridge, expiring tomorrow', async () => {
    fetchProduct.mockResolvedValueOnce(offCard('Pâte à tartiner Nutella'));
    const scan = await as(one).get(`/api/scan/${CODE}`);
    expect(scan.body.status).toBe('suggested');
    product1 = scan.body.product.id;
    const fridge = await fridgeOf(one);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const added = await as(one).post('/api/stock/adjust').send({
      productId: product1,
      locationId: fridge.id,
      shelfId: fridge.shelf,
      delta: 3,
      expiryDate: tomorrow,
      reason: 'scan_add',
    });
    expect(added.status).toBe(200);
  });

  it('household 2 sees it nowhere: furniture, products, search, history, soon expired, filters', async () => {
    const seen = await everythingSeenBy(two, product1);
    expect(seen).not.toMatch(/tartiner|nutella/i);
    const home = await as(two).get('/api/home');
    for (const location of home.body.locations) {
      expect(location.counts).toEqual({ products: 0, units: 0, expired: 0, soon: 0 });
    }
  });

  it('household 2 scanning the same code starts from Open Food Facts, not from the card of 1', async () => {
    fetchProduct.mockClear();
    fetchProduct.mockResolvedValueOnce(offCard('Pâte à tartiner (foyer 2)'));
    const scan = await as(two).get(`/api/scan/${CODE}`);
    expect(fetchProduct).toHaveBeenCalledOnce();
    expect(scan.body.status).toBe('suggested');
    product2 = scan.body.product.id;
    expect(product2).not.toBe(product1);
    expect(scan.body.product.name).toBe('Pâte à tartiner (foyer 2)');
    const fridge = await fridgeOf(two);
    await as(two)
      .post('/api/stock/adjust')
      .send({ productId: product2, locationId: fridge.id, delta: 2, reason: 'scan_add' });
  });

  it('keeps two products and two independent stock lines; removing in one changes nothing in the other', async () => {
    const lines = await ownerPool().query<{ household_id: number; quantity: number }>(
      `SELECT s.household_id, s.quantity FROM stock_items s JOIN products p ON p.id = s.product_id
        WHERE p.barcode = $1 ORDER BY s.household_id`,
      [CODE],
    );
    expect(lines.rows).toEqual([
      { household_id: HOUSEHOLD, quantity: 3 },
      { household_id: household2, quantity: 2 },
    ]);
    expect((await as(two).post('/api/stock/remove').send({ productId: product2 })).status).toBe(
      200,
    );
    const one1 = await as(one).get(`/api/products/${product1}`);
    expect(one1.body.stock[0].quantity).toBe(3);
    const two2 = await as(two).get(`/api/products/${product2}`);
    expect(two2.body.stock[0].quantity).toBe(1);
    // And the other way round.
    expect((await as(one).post('/api/stock/remove').send({ productId: product2 })).status).toBe(
      404,
    );
    expect((await as(two).get(`/api/products/${product1}`)).status).toBe(404);
  });

  it('keeps two « Frigo » as two distinct pieces of furniture', async () => {
    const fridge1 = await fridgeOf(one);
    const fridge2 = await fridgeOf(two);
    expect(fridge1.id).not.toBe(fridge2.id);
    const names = async (cookie: string) =>
      (await as(cookie).get('/api/locations')).body.map((l: { name: string }) => l.name);
    expect(await names(one)).toContain('Frigo');
    expect(await names(two)).toContain('Frigo');
  });

  it('keeps the catalog sealed: a product made, renamed, moved and photographed by 1 never reaches 2', async () => {
    const categories = (await as(one).get('/api/categories')).body as { id: number }[];
    const created = await as(one)
      .post('/api/products')
      .send({ name: 'Confiture maison', categoryId: categories[0]!.id });
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    await as(one).patch(`/api/products/${id}`).send({ name: 'Confiture de mirabelles' });
    await as(one).patch(`/api/products/${id}`).send({ categoryId: categories[1]!.id });
    const jpeg = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#aa3311' },
    })
      .jpeg()
      .toBuffer();
    const photo = await request(server())
      .post(`/api/products/${id}/image`)
      .set('Cookie', one)
      .set('Origin', ORIGIN)
      .attach('image', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(photo.status).toBe(201);
    const imageUrl = photo.body.imageUrl as string;

    for (const q of ['confiture', 'mirabelles', 'confiture de mirabelles', 'mirabel']) {
      const found = await as(two).get(`/api/products?q=${encodeURIComponent(q)}`);
      expect(found.body, q).toEqual([]);
    }
    expect((await as(two).get(imageUrl)).status).toBe(404);
    expect((await as(one).get(imageUrl)).status).toBe(200);
  });
});
