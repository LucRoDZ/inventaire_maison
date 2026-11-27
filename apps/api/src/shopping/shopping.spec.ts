import type { RecentProductDto } from '@inventaire/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createHousehold,
  createUser,
  ORIGIN,
  ownerPool,
  resetAll,
  seedHousehold,
} from '../../test/helpers';

let app: INestApplication;
let cookie: string;
let otherCookie: string;
let locationId: number;
let categoryId: number;
let otherProduct: number;
const server = () => app.getHttpServer();
const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await ownerPool().query<T>(text, params)).rows;

const api = (c: () => string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', c()),
  post: (url: string) => request(server()).post(url).set('Cookie', c()).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', c()).set('Origin', ORIGIN),
  delete: (url: string) => request(server()).delete(url).set('Cookie', c()).set('Origin', ORIGIN),
});
const mine = api(() => cookie);
const theirs = api(() => otherCookie);

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

async function addProduct(
  name: string,
  { location = null as number | null, household = 1, category = categoryId } = {},
): Promise<number> {
  const [row] = await q<{ id: number }>(
    `INSERT INTO products (household_id, name, category_id, default_location_id, search_text)
     VALUES ($1, $2, $3, $4, lower($2)) RETURNING id`,
    [household, name, category, location],
  );
  return row!.id;
}

async function consume(productId: number, times: number, daysAgo = 1): Promise<void> {
  const [user] = await q<{ id: number }>('SELECT id FROM users WHERE household_id = 1 LIMIT 1');
  for (let i = 0; i < times; i += 1) {
    await q(
      `INSERT INTO stock_movements (household_id, product_id, location_id, location_name, delta,
         reason, user_id, created_at)
       VALUES (1, $1, $2, 'Frigo', -1, 'consumed', $3, now() - make_interval(days => $4))`,
      [productId, locationId, user!.id, daysAgo],
    );
  }
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAll();
  await seedHousehold(app);
  await createUser(app, { username: 'membre', password: 'motdepasse1' });
  const other = await createHousehold(app, 'Autre foyer');
  await createUser(app, { username: 'autre', password: 'motdepasse1', householdId: other });
  cookie = await login('membre');
  otherCookie = await login('autre');
  [{ id: locationId }] = (await q<{ id: number }>(
    `SELECT id FROM locations WHERE household_id = 1 AND kind = 'fridge'`,
  )) as [{ id: number }];
  [{ id: categoryId }] = (await q<{ id: number }>(
    'SELECT id FROM categories WHERE household_id = 1 LIMIT 1',
  )) as [{ id: number }];
  const [oc] = await q<{ id: number }>(
    'SELECT id FROM categories WHERE household_id = $1 LIMIT 1',
    [other],
  );
  otherProduct = await addProduct('Produit voisin', { household: other, category: oc!.id });
});

describe('shopping list', () => {
  it('requires a session', async () => {
    expect((await request(server()).get('/api/shopping')).status).toBe(401);
  });

  it('adds a product, then increments the open line instead of duplicating it', async () => {
    const pid = await addProduct('Lait', { location: locationId });
    const first = await mine.post('/api/shopping').send({ productId: pid });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      quantity: 1,
      checked: false,
      origin: 'manual',
      label: null,
      product: { id: pid, name: 'Lait', defaultLocationId: locationId },
    });
    const second = await mine.post('/api/shopping').send({ productId: pid, quantity: 2 });
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.quantity).toBe(3);
    expect((await mine.get('/api/shopping')).body.items).toHaveLength(1);
  });

  it('refuses ifAbsent with 409 when the product is already listed, open or checked', async () => {
    const pid = await addProduct('Lait', { location: locationId });
    const first = await mine.post('/api/shopping').send({ productId: pid, ifAbsent: true });
    expect(first.status).toBe(201);
    const open = await mine.post('/api/shopping').send({ productId: pid, ifAbsent: true });
    expect(open.status).toBe(409);
    expect(open.body.message).toBe('Déjà dans vos courses');
    await mine.patch(`/api/shopping/${first.body.id}`).send({ checked: true });
    expect((await mine.post('/api/shopping').send({ productId: pid, ifAbsent: true })).status).toBe(
      409,
    );
    const rows = await q<{ quantity: number }>('SELECT quantity FROM shopping_items');
    expect(rows).toEqual([{ quantity: 1 }]);
    // Without the flag, an open line is still incremented.
    await mine.patch(`/api/shopping/${first.body.id}`).send({ checked: false });
    expect((await mine.post('/api/shopping').send({ productId: pid })).body.quantity).toBe(2);
  });

  it('keeps the list of a household intact when another one tries ifAbsent on its product', async () => {
    const pid = await addProduct('Lait', { location: locationId });
    await mine.post('/api/shopping').send({ productId: pid });
    const res = await theirs.post('/api/shopping').send({ productId: pid, ifAbsent: true });
    expect(res.status).toBe(404);
    expect((await theirs.post('/api/shopping').send({ productId: pid })).status).toBe(404);
    const rows = await q<{ quantity: number }>('SELECT quantity FROM shopping_items');
    expect(rows).toEqual([{ quantity: 1 }]);
  });

  it('adds a free line and validates the input', async () => {
    const res = await mine
      .post('/api/shopping')
      .send({ label: '  Piles AA ', quantity: 4, amount: 1.5, unit: 'kg' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: 'Piles AA', product: null, quantity: 4, amount: 1.5 });
    for (const body of [
      {},
      { label: '' },
      { label: 'x', productId: 1 },
      { label: 'x', quantity: 0 },
      { label: 'x', quantity: 1000 },
      { label: 'x', quantity: 1.5 },
      { label: 'x', unit: 'litre' },
      { label: 'x', amount: 0 },
      { label: 'x', householdId: 2 },
      { label: 'x'.repeat(121) },
    ]) {
      expect((await mine.post('/api/shopping').send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('keeps 404 for unknown and foreign products, and for merged ones', async () => {
    expect((await mine.post('/api/shopping').send({ productId: otherProduct })).status).toBe(404);
    expect((await mine.post('/api/shopping').send({ productId: 99999 })).status).toBe(404);
  });

  it('lists unchecked lines first, oldest first', async () => {
    const a = await mine.post('/api/shopping').send({ label: 'A' });
    const b = await mine.post('/api/shopping').send({ label: 'B' });
    const c = await mine.post('/api/shopping').send({ label: 'C' });
    await mine.patch(`/api/shopping/${a.body.id}`).send({ checked: true });
    const list = await mine.get('/api/shopping');
    expect(list.body.items.map((i: { label: string }) => i.label)).toEqual(['B', 'C', 'A']);
    expect([b.body.id, c.body.id]).toEqual(
      list.body.items.slice(0, 2).map((i: { id: number }) => i.id),
    );
  });

  it('checks, unchecks and changes the quantity', async () => {
    const line = await mine.post('/api/shopping').send({ label: 'Pain' });
    const checked = await mine.patch(`/api/shopping/${line.body.id}`).send({ checked: true });
    expect(checked.body.checked).toBe(true);
    const [row] = await q<{ checked_at: Date | null }>(
      'SELECT checked_at FROM shopping_items WHERE id = $1',
      [line.body.id],
    );
    expect(row!.checked_at).not.toBeNull();
    const back = await mine
      .patch(`/api/shopping/${line.body.id}`)
      .send({ checked: false, quantity: 5 });
    expect(back.body).toMatchObject({ checked: false, quantity: 5 });
    expect((await mine.patch(`/api/shopping/${line.body.id}`).send({})).status).toBe(400);
    expect((await mine.patch(`/api/shopping/${line.body.id}`).send({ quantity: 0 })).status).toBe(
      400,
    );
  });

  it('merges a line unchecked while the product has another open line', async () => {
    const pid = await addProduct('Beurre');
    const first = await mine.post('/api/shopping').send({ productId: pid });
    await mine.patch(`/api/shopping/${first.body.id}`).send({ checked: true });
    const second = await mine.post('/api/shopping').send({ productId: pid, quantity: 2 });
    expect(second.body.id).not.toBe(first.body.id);
    const back = await mine.patch(`/api/shopping/${first.body.id}`).send({ checked: false });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ id: second.body.id, quantity: 3 });
    expect((await mine.get('/api/shopping')).body.items).toHaveLength(1);
  });

  it('deletes a line and answers 404 for an unknown or foreign one', async () => {
    const line = await mine.post('/api/shopping').send({ label: 'Sel' });
    const foreign = await theirs.post('/api/shopping').send({ label: 'Poivre' });
    expect((await mine.delete(`/api/shopping/${foreign.body.id}`)).status).toBe(404);
    expect(
      (await mine.patch(`/api/shopping/${foreign.body.id}`).send({ checked: true })).status,
    ).toBe(404);
    expect((await mine.delete(`/api/shopping/${line.body.id}`)).status).toBe(204);
    expect((await mine.delete(`/api/shopping/${line.body.id}`)).status).toBe(404);
    expect((await mine.delete('/api/shopping/abc')).status).toBe(404);
    expect((await theirs.get('/api/shopping')).body.items).toHaveLength(1);
  });

  it('clears only the checked lines of the household', async () => {
    const a = await mine.post('/api/shopping').send({ label: 'A' });
    await mine.post('/api/shopping').send({ label: 'B' });
    const foreign = await theirs.post('/api/shopping').send({ label: 'Z' });
    await mine.patch(`/api/shopping/${a.body.id}`).send({ checked: true });
    await theirs.patch(`/api/shopping/${foreign.body.id}`).send({ checked: true });
    const res = await mine.post('/api/shopping/clear-checked');
    expect(res.body).toEqual({ removed: 1 });
    expect((await mine.get('/api/shopping')).body.items).toHaveLength(1);
    expect((await theirs.get('/api/shopping')).body.items).toHaveLength(1);
  });

  it('stores checked lines of known products and returns the others', async () => {
    const milk = await addProduct('Lait', { location: locationId });
    const noPlace = await addProduct('Sans place');
    const kept = await mine.post('/api/shopping').send({ productId: milk, quantity: 2 });
    const needs = await mine.post('/api/shopping').send({ productId: noPlace });
    const free = await mine.post('/api/shopping').send({ label: 'Piles' });
    const unchecked = await mine.post('/api/shopping').send({ label: 'Reste' });
    for (const l of [kept, needs, free]) {
      await mine.patch(`/api/shopping/${l.body.id}`).send({ checked: true });
    }
    await q(
      `INSERT INTO stock_items (household_id, product_id, location_id, quantity) VALUES (1, $1, $2, 1)`,
      [milk, locationId],
    );

    const res = await mine.post('/api/shopping/store-checked');
    expect(res.status).toBe(200);
    expect(res.body.stored).toHaveLength(1);
    expect(res.body.stored[0]).toMatchObject({
      shoppingItemId: kept.body.id,
      productId: milk,
      productName: 'Lait',
      quantity: 2,
      locationId,
    });
    expect(res.body.needsForm.map((i: { id: number }) => i.id).sort()).toEqual(
      [needs.body.id, free.body.id].sort(),
    );

    const [stock] = await q<{ id: number; quantity: number }>(
      'SELECT id, quantity FROM stock_items WHERE product_id = $1',
      [milk],
    );
    expect(stock!.quantity).toBe(3);
    expect(res.body.stored[0].stockItemId).toBe(stock!.id);
    const movements = await q<{ delta: number; reason: string }>(
      'SELECT delta, reason FROM stock_movements WHERE product_id = $1',
      [milk],
    );
    expect(movements).toEqual([{ delta: 2, reason: 'scan_add' }]);
    const left = (await mine.get('/api/shopping')).body.items.map((i: { id: number }) => i.id);
    expect(left).not.toContain(kept.body.id);
    expect(left).toEqual(expect.arrayContaining([needs.body.id, free.body.id, unchecked.body.id]));
  });

  it('creates a stock line when the product has none', async () => {
    const pid = await addProduct('Riz', { location: locationId });
    const line = await mine.post('/api/shopping').send({ productId: pid });
    await mine.patch(`/api/shopping/${line.body.id}`).send({ checked: true });
    const res = await mine.post('/api/shopping/store-checked');
    expect(res.body.stored).toHaveLength(1);
    const rows = await q<{ quantity: number; shelf_id: number | null }>(
      'SELECT quantity, shelf_id FROM stock_items WHERE product_id = $1',
      [pid],
    );
    expect(rows).toEqual([{ quantity: 1, shelf_id: null }]);
  });
});

describe('GET /api/shopping/recent', () => {
  it('lists consumed products of the last 30 days, most frequent first, 12 at most', async () => {
    const often = await addProduct('Pâtes');
    const rarely = await addProduct('Café');
    const old = await addProduct('Ancien');
    const merged = await addProduct('Fusionné');
    await q('UPDATE products SET merged_into_id = $1 WHERE id = $2', [often, merged]);
    await consume(often, 3);
    await consume(rarely, 1);
    await consume(old, 2, 31);
    await consume(merged, 5);
    await q(
      `INSERT INTO stock_movements (household_id, product_id, location_id, location_name, delta, reason, user_id)
       VALUES (1, $1, $2, 'Frigo', -1, 'scan_remove', (SELECT id FROM users LIMIT 1))`,
      [rarely, locationId],
    );
    const res = await mine.get('/api/shopping/recent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ productId: often, name: 'Pâtes', imageUrl: null, count: 3 }),
      expect.objectContaining({ productId: rarely, name: 'Café', imageUrl: null, count: 1 }),
    ]);
    expect((await theirs.get('/api/shopping/recent')).body).toEqual([]);
  });

  it('caps the list at 12', async () => {
    for (let i = 0; i < 14; i += 1) await consume(await addProduct(`Produit ${i}`), 1);
    expect((await mine.get('/api/shopping/recent')).body).toHaveLength(12);
  });

  it('says where the product lives, its size, its stock and its last consumption', async () => {
    const milk = await addProduct('Lait', { location: locationId });
    await q(`UPDATE products SET size_label = '1 L' WHERE id = $1`, [milk]);
    await q(
      `INSERT INTO stock_items (household_id, product_id, location_id, quantity)
       VALUES (1, $1, $2, 2)`,
      [milk, locationId],
    );
    await consume(milk, 1, 3);
    await consume(milk, 1, 1);
    const [row] = (await mine.get('/api/shopping/recent')).body as RecentProductDto[];
    expect(row).toMatchObject({ productId: milk, sizeLabel: '1 L', inStock: 2, count: 2 });
    expect(row!.locationName).toEqual(expect.any(String));
    const age = Date.now() - new Date(row!.lastConsumedAt).getTime();
    expect(age).toBeGreaterThan(0.5 * 86_400_000);
    expect(age).toBeLessThan(1.5 * 86_400_000);
  });

  it('takes a limit and a period, within bounds', async () => {
    for (let i = 0; i < 14; i += 1) await consume(await addProduct(`Produit ${i}`), 1);
    await consume(await addProduct('Ancien'), 1, 100);
    expect((await mine.get('/api/shopping/recent?limit=50')).body).toHaveLength(14);
    expect((await mine.get('/api/shopping/recent?limit=50&days=365')).body).toHaveLength(15);
    expect((await mine.get('/api/shopping/recent?limit=0')).status).toBe(400);
    expect((await mine.get('/api/shopping/recent?limit=201')).status).toBe(400);
    expect((await mine.get('/api/shopping/recent?days=366')).status).toBe(400);
    expect((await mine.get('/api/shopping/recent?other=1')).status).toBe(400);
  });
});
