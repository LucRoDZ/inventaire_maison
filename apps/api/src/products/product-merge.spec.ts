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
let fridge: number;
let pantry: number;
let other: number;
const server = () => app.getHttpServer();
const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await ownerPool().query<T>(text, params)).rows;

const api = (c: () => string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', c()),
  post: (url: string) => request(server()).post(url).set('Cookie', c()).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', c()).set('Origin', ORIGIN),
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

async function product(
  name: string,
  { household = 1, barcode = null as string | null } = {},
): Promise<number> {
  const [cat] = await q<{ id: number }>(
    'SELECT id FROM categories WHERE household_id = $1 LIMIT 1',
    [household],
  );
  const category = cat!.id;
  const [row] = await q<{ id: number }>(
    `INSERT INTO products (household_id, name, category_id, barcode, search_text)
     VALUES ($1, $2, $3, $4, lower($2)) RETURNING id`,
    [household, name, category, barcode],
  );
  return row!.id;
}

async function stock(
  productId: number,
  locationId: number,
  quantity: number,
  expiry: string | null = null,
): Promise<void> {
  await q(
    `INSERT INTO stock_items (household_id, product_id, location_id, quantity, expiry_date)
     VALUES (1, $1, $2, $3, $4)`,
    [productId, locationId, quantity, expiry],
  );
}

const lines = (productId: number) =>
  q<{ location_id: number; quantity: number; expiry_date: string | null }>(
    `SELECT location_id, quantity, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date
     FROM stock_items WHERE product_id = $1 ORDER BY location_id, expiry_date`,
    [productId],
  );

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
  other = await createHousehold(app, 'Autre foyer');
  await createUser(app, { username: 'autre', password: 'motdepasse1', householdId: other });
  cookie = await login('membre');
  otherCookie = await login('autre');
  fridge = (
    await q<{ id: number }>(`SELECT id FROM locations WHERE household_id = 1 AND kind = 'fridge'`)
  )[0]!.id;
  pantry = (
    await q<{ id: number }>(`SELECT id FROM locations WHERE household_id = 1 AND kind = 'pantry'`)
  )[0]!.id;
});

describe('POST /api/products/:id/merge', () => {
  it('moves the stock with correction movements and merges identical lines', async () => {
    const dup = await product('Lait demi');
    const kept = await product('Lait');
    await stock(dup, fridge, 2, '2030-01-01');
    await stock(dup, pantry, 1);
    await stock(kept, fridge, 3, '2030-01-01');
    await q(
      `INSERT INTO stock_movements (household_id, product_id, location_id, location_name, delta, reason, user_id)
       VALUES (1, $1, $2, 'Frigo', 3, 'scan_add', (SELECT id FROM users LIMIT 1))`,
      [dup, fridge],
    );
    const journal = await q<{ n: string }>(
      'SELECT count(*)::text AS n FROM stock_movements WHERE reason = $1',
      ['scan_add'],
    );

    const res = await mine.post(`/api/products/${dup}/merge`).send({ intoProductId: kept });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kept: { id: kept, name: 'Lait', mergedIntoId: null },
      movedUnits: 3,
      movedLines: 2,
      movedShoppingItems: 0,
    });
    expect(await lines(dup)).toEqual([]);
    expect(await lines(kept)).toEqual(
      [
        { location_id: fridge, quantity: 5, expiry_date: '2030-01-01' },
        { location_id: pantry, quantity: 1, expiry_date: null },
      ].sort((x, y) => x.location_id - y.location_id),
    );
    const corrections = await q<{ product_id: number; delta: number }>(
      `SELECT product_id, delta FROM stock_movements WHERE reason = 'correction' ORDER BY id`,
    );
    expect(corrections).toHaveLength(4);
    expect(
      corrections
        .filter((c) => c.product_id === dup)
        .map((c) => c.delta)
        .sort((x, y) => x - y),
    ).toEqual([-2, -1]);
    expect(
      corrections
        .filter((c) => c.product_id === kept)
        .map((c) => c.delta)
        .sort((x, y) => x - y),
    ).toEqual([1, 2]);
    // The journal of the merged product is untouched.
    expect(
      await q<{ n: string }>('SELECT count(*)::text AS n FROM stock_movements WHERE reason = $1', [
        'scan_add',
      ]),
    ).toEqual(journal);
    const [row] = await q<{ merged_into_id: number }>(
      'SELECT merged_into_id FROM products WHERE id = $1',
      [dup],
    );
    expect(row!.merged_into_id).toBe(kept);
  });

  it('hides the merged product from search and leads its barcode to the kept one', async () => {
    const dup = await product('Yaourt nature', { barcode: '3017620422003' });
    const kept = await product('Yaourt');
    await mine.post(`/api/products/${dup}/merge`).send({ intoProductId: kept });
    const found = await mine.get('/api/products?q=yaourt');
    expect(found.body.map((p: { id: number }) => p.id)).toEqual([kept]);
    expect((await mine.get('/api/products')).body.map((p: { id: number }) => p.id)).toEqual([kept]);
    const scan = await mine.get('/api/scan/3017620422003?catalogOnly=true');
    expect(scan.body).toMatchObject({ status: 'known', product: { id: kept } });
    expect((await mine.get(`/api/products/${dup}`)).body.mergedIntoId).toBe(kept);
  });

  it('moves and merges the open shopping lines', async () => {
    const dup = await product('Pâtes A');
    const kept = await product('Pâtes B');
    const loneDup = await product('Riz A');
    const loneKept = await product('Riz B');
    await mine.post('/api/shopping').send({ productId: dup, quantity: 2 });
    await mine.post('/api/shopping').send({ productId: kept, quantity: 3 });
    await mine.post('/api/shopping').send({ productId: loneDup });
    const res = await mine.post(`/api/products/${dup}/merge`).send({ intoProductId: kept });
    expect(res.body.movedShoppingItems).toBe(1);
    const both = await q<{ product_id: number; quantity: number }>(
      'SELECT product_id, quantity FROM shopping_items ORDER BY id',
    );
    expect(both).toEqual([
      { product_id: kept, quantity: 5 },
      { product_id: loneDup, quantity: 1 },
    ]);
    const res2 = await mine
      .post(`/api/products/${loneDup}/merge`)
      .send({ intoProductId: loneKept });
    expect(res2.body.movedShoppingItems).toBe(1);
    expect(
      (await q<{ product_id: number }>('SELECT product_id FROM shopping_items ORDER BY id')).map(
        (r) => r.product_id,
      ),
    ).toEqual([kept, loneKept]);
  });

  it('refuses itself, a merged product and unknown or foreign products', async () => {
    const a = await product('A');
    const b = await product('B');
    const c = await product('C');
    const foreign = await product('Voisin', { household: other });
    expect((await mine.post(`/api/products/${a}/merge`).send({ intoProductId: a })).status).toBe(
      400,
    );
    expect(
      (await mine.post(`/api/products/${a}/merge`).send({ intoProductId: 99999 })).status,
    ).toBe(404);
    expect(
      (await mine.post(`/api/products/${a}/merge`).send({ intoProductId: foreign })).status,
    ).toBe(404);
    expect(
      (await mine.post(`/api/products/${foreign}/merge`).send({ intoProductId: a })).status,
    ).toBe(404);
    expect((await mine.post(`/api/products/${a}/merge`).send({})).status).toBe(400);
    expect((await mine.post(`/api/products/${a}/merge`).send({ intoProductId: b })).status).toBe(
      200,
    );
    expect((await mine.post(`/api/products/${a}/merge`).send({ intoProductId: c })).status).toBe(
      409,
    );
    expect((await mine.post(`/api/products/${c}/merge`).send({ intoProductId: a })).status).toBe(
      409,
    );
  });

  it('keeps earlier merges pointing at the final product', async () => {
    const a = await product('A', { barcode: '5449000000996' });
    const b = await product('B');
    const c = await product('C');
    await mine.post(`/api/products/${a}/merge`).send({ intoProductId: b });
    await mine.post(`/api/products/${b}/merge`).send({ intoProductId: c });
    expect((await mine.get(`/api/products/${a}`)).body.mergedIntoId).toBe(c);
    expect((await mine.get('/api/scan/5449000000996?catalogOnly=true')).body.product.id).toBe(c);
  });

  it('evaluates the minimum of the kept product afterwards', async () => {
    const dup = await product('Sucre A');
    const kept = await product('Sucre B');
    await q('UPDATE products SET min_quantity = 3 WHERE id = $1', [kept]);
    await stock(dup, pantry, 4);
    await mine.post(`/api/products/${dup}/merge`).send({ intoProductId: kept });
    expect(await q('SELECT 1 FROM shopping_items WHERE product_id = $1', [kept])).toEqual([]);
  });
});

describe('POST /api/products/:id/barcode', () => {
  it('attaches a normalised barcode to a product without one', async () => {
    const id = await product('Maison');
    const res = await mine.post(`/api/products/${id}/barcode`).send({ barcode: '5449 0000 00996' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, barcode: '5449000000996' });
    // A UPC-A gets its leading zero; the same code again is accepted.
    const again = await mine.post(`/api/products/${id}/barcode`).send({ barcode: '5449000000996' });
    expect(again.status).toBe(200);
    const upc = await product('Américain');
    const res2 = await mine.post(`/api/products/${upc}/barcode`).send({ barcode: '036000291452' });
    expect(res2.body.barcode).toBe('0036000291452');
  });

  it('answers 400 for an invalid code, 409 when taken or when the product has another one', async () => {
    const id = await product('Maison');
    const taken = await product('Pris', { barcode: '3017620422003' });
    for (const barcode of ['', 'abc', '12345', '5449000000997']) {
      expect(
        (await mine.post(`/api/products/${id}/barcode`).send({ barcode })).status,
        barcode,
      ).toBe(400);
    }
    expect((await mine.post(`/api/products/${id}/barcode`).send({})).status).toBe(400);
    const clash = await mine.post(`/api/products/${id}/barcode`).send({ barcode: '3017620422003' });
    expect(clash.status).toBe(409);
    expect(clash.body.productId).toBe(taken);
    expect(
      (await mine.post(`/api/products/${taken}/barcode`).send({ barcode: '5449000000996' })).status,
    ).toBe(409);
    // Nothing was written.
    const [row] = await q<{ barcode: string | null }>(
      'SELECT barcode FROM products WHERE id = $1',
      [id],
    );
    expect(row!.barcode).toBeNull();
  });

  it('is free in another household and sealed from this one', async () => {
    const id = await product('Maison');
    const foreign = await product('Voisin', { household: other, barcode: '5449000000996' });
    expect(
      (await mine.post(`/api/products/${id}/barcode`).send({ barcode: '5449000000996' })).status,
    ).toBe(200);
    expect(
      (await mine.post(`/api/products/${foreign}/barcode`).send({ barcode: '3017620422003' }))
        .status,
    ).toBe(404);
    expect((await theirs.get(`/api/products/${id}`)).status).toBe(404);
  });
});
