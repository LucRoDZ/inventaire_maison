import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { householdImageDir } from '../src/database/legacy-images';
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
import { listRoutes } from './routes';

/**
 * Isolation of the households (critical). Household A (members alice and the admin root) and
 * household B (member bob) both hold data in every table. For every route of the API, listed from
 * the controllers, A reads, changes and deletes nothing of B: an id of B answers 404, lists hold
 * nothing of B, and nothing of A can point at an object of B. A route without a check below makes
 * the test fail.
 */

let app: INestApplication;
let alice: string;
let root: string;
let bob: string;
let A: number;
let B: number;
const NAME_A = 'Foyer Alpha Zeta';
const NAME_B = 'Foyer Beta Omega';
const B_ENDPOINT = 'https://push.example.test/household-b';
/** Word carried by every visible name of B's data: it must never reach A. */
const MARK_B = 'Oméga';
/** Idempotency key held by both households: the same key never collides across them. */
const SHARED_KEY = 'shared-key-fixture';

interface Ids {
  location: number;
  otherLocation: number;
  shelf: number;
  category: number;
  product: number;
  stockItem: number;
  mapping: number;
  image: string;
  barcode: string;
  shopping: number;
}
let a: Ids;
let b: Ids;

const server = () => app.getHttpServer();
const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await ownerPool().query<T>(text, params)).rows;

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  expect(res.status).toBe(200);
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

const as = (cookie: string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  post: (url: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
  delete: (url: string) =>
    request(server()).delete(url).set('Cookie', cookie).set('Origin', ORIGIN),
});

/** Fills a household with one product in stock, a movement, a mapping and a picture. */
async function fill(householdId: number, mark: string, barcode: string): Promise<Ids> {
  const [location] = await q<{ id: number }>(
    `SELECT id FROM locations WHERE household_id = $1 AND kind = 'fridge'`,
    [householdId],
  );
  const [other] = await q<{ id: number }>(
    `SELECT id FROM locations WHERE household_id = $1 AND kind = 'pantry'`,
    [householdId],
  );
  // Every name of B carries its mark, so that a leak shows in any text.
  await q(`UPDATE locations SET name = name || ' ' || $2 WHERE household_id = $1`, [
    householdId,
    mark,
  ]);
  const [shelf] = await q<{ id: number }>(
    'SELECT id FROM shelves WHERE location_id = $1 ORDER BY sort_order LIMIT 1',
    [location!.id],
  );
  await q(`UPDATE shelves SET name = name || ' ' || $2 WHERE household_id = $1`, [
    householdId,
    mark,
  ]);
  const [category] = await q<{ id: number }>(
    `INSERT INTO categories (household_id, name, icon, sort_order) VALUES ($1, $2, 'cake-slice', 99) RETURNING id`,
    [householdId, `Catégorie ${mark}`],
  );
  const [mapping] = await q<{ id: number }>(
    `INSERT INTO off_category_map (household_id, off_tag, category_id) VALUES ($1, $2, $3) RETURNING id`,
    [householdId, `fr:gateau-${mark === MARK_B ? 'omega' : 'alpha'}`, category!.id],
  );
  const image = `${(householdId === B ? 'b' : 'a').repeat(32)}.webp`;
  const dir = householdImageDir(process.env['IMAGES_DIR']!, householdId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, image),
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } })
      .webp()
      .toBuffer(),
  );
  const [user] = await q<{ id: number }>('SELECT id FROM users WHERE household_id = $1 LIMIT 1', [
    householdId,
  ]);
  const name = `Gâteau ${mark}`;
  const [product] = await q<{ id: number }>(
    `INSERT INTO products (household_id, barcode, name, brand, category_id, default_location_id,
       image_path, search_text, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, lower($3), $8) RETURNING id`,
    [householdId, barcode, name, `Marque ${mark}`, category!.id, location!.id, image, user!.id],
  );
  const [stock] = await q<{ id: number }>(
    `INSERT INTO stock_items (household_id, product_id, location_id, shelf_id, quantity, expiry_date)
     VALUES ($1, $2, $3, $4, 3, current_date + 1) RETURNING id`,
    [householdId, product!.id, location!.id, shelf!.id],
  );
  await q(
    `INSERT INTO stock_movements (household_id, product_id, location_id, shelf_id, location_name,
       shelf_name, delta, reason, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, 3, 'scan_add', $7)`,
    [
      householdId,
      product!.id,
      location!.id,
      shelf!.id,
      `Frigo ${mark}`,
      `Étagère ${mark}`,
      user!.id,
    ],
  );
  await q(
    `INSERT INTO idempotency_keys (household_id, key, device_id, result)
     VALUES ($1, $2, 'device-fixture', '{"status":"applied"}')`,
    [householdId, SHARED_KEY],
  );
  const [shopping] = await q<{ id: number }>(
    `INSERT INTO shopping_items (household_id, product_id, quantity, checked, checked_at)
     VALUES ($1, $2, 2, $3, CASE WHEN $3 THEN now() END) RETURNING id`,
    [householdId, product!.id, householdId === B],
  );
  return {
    shopping: shopping!.id,
    location: location!.id,
    otherLocation: other!.id,
    shelf: shelf!.id,
    category: category!.id,
    product: product!.id,
    stockItem: stock!.id,
    mapping: mapping!.id,
    image,
    barcode,
  };
}

/** Every row of B, to prove at the end that nothing of it changed. */
async function snapshotB(): Promise<string> {
  const tables = [
    'locations',
    'shelves',
    'categories',
    'off_category_map',
    'products',
    'stock_items',
    'stock_movements',
    'settings',
    'push_subscriptions',
    'shopping_items',
  ];
  const parts: unknown[] = [];
  for (const table of tables) {
    // The first column is the key of every table (`id`, or `household_id` for the settings).
    parts.push(await q(`SELECT * FROM ${table} WHERE household_id = $1 ORDER BY 1`, [B]));
  }
  parts.push(await q('SELECT * FROM idempotency_keys WHERE household_id = $1 ORDER BY key', [B]));
  parts.push(await q('SELECT id, name FROM households WHERE id = $1', [B]));
  return JSON.stringify(parts);
}

/** No key nor value of the response names a household (decision D2). */
function assertNoHousehold(body: unknown, where: string): void {
  const text = JSON.stringify(body ?? null);
  expect(text, where).not.toMatch(/household/i);
  expect(text, where).not.toContain(NAME_A);
  expect(text, where).not.toContain(NAME_B);
}

/** Nothing of B in the response. */
function assertNothingOfB(body: unknown, where: string): void {
  expect(JSON.stringify(body ?? null), where).not.toContain(MARK_B);
}

type Client = ReturnType<typeof as>;
type Check = (client: Client, who: string) => Promise<void>;

/** Routes that never touch household data; still called once to prove they reveal nothing. */
const checks: Record<string, Check> = {
  'GET /api/health': async () => {
    expect((await request(server()).get('/api/health')).body).toEqual({ status: 'ok' });
  },
  'POST /api/auth/login': async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'alice', password: 'motdepasse1' });
    expect(Object.keys(res.body).sort()).toEqual(['dataScope', 'id', 'role', 'username']);
    assertNoHousehold(res.body, 'login');
  },
  'POST /api/auth/logout': async () => {
    const throwaway = await login('alice');
    const res = await as(throwaway).post('/api/auth/logout');
    expect(res.status).toBe(204);
  },
  'GET /api/auth/me': async (client, who) => {
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['dataScope', 'id', 'role', 'username']);
    assertNoHousehold(res.body, `${who} me`);
  },
  'POST /api/auth/password': async (client) => {
    // An invalid body changes nothing; the route has no household data.
    expect((await client.post('/api/auth/password').send({})).status).toBe(400);
  },

  // Household data: an id of B is unknown to A.
  'GET /api/locations': async (client, who) => {
    const res = await client.get('/api/locations');
    expect(res.status).toBe(200);
    const ids = res.body.map((l: { id: number }) => l.id);
    expect(ids).toContain(a.location);
    expect(ids).not.toContain(b.location);
    assertNothingOfB(res.body, `${who} locations`);
    assertNoHousehold(res.body, `${who} locations`);
  },
  'POST /api/locations': async (client, who) => {
    // Created in the household of the request, whatever a body might say.
    expect(
      (await client.post('/api/locations').send({ name: 'Intrus', kind: 'other', householdId: B }))
        .status,
    ).toBe(400);
    const res = await client.post('/api/locations').send({ name: `Remise ${who}`, kind: 'other' });
    expect(res.status).toBe(201);
    assertNoHousehold(res.body, 'create location');
    const [row] = await q<{ household_id: number }>(
      'SELECT household_id FROM locations WHERE id = $1',
      [res.body.id],
    );
    expect(row!.household_id).toBe(A);
    // The same name as a piece of furniture of B is free in A.
    const same = await client
      .post('/api/locations')
      .send({ name: `Frigo ${MARK_B}`, kind: 'fridge' });
    expect(same.status).toBe(201);
    for (const id of [res.body.id, same.body.id]) {
      expect((await client.delete(`/api/locations/${id}`)).status).toBe(204);
    }
  },
  'DELETE /api/locations/:id': async (client) => {
    expect((await client.delete(`/api/locations/${b.location}`)).status).toBe(404);
    // The stock of A can never be poured into a piece of furniture of B.
    expect(
      (await client.delete(`/api/locations/${a.location}?moveStockTo=${b.location}`)).status,
    ).toBe(404);
    const [line] = await q('SELECT 1 FROM stock_items WHERE id = $1', [a.stockItem]);
    expect(line).toBeDefined();
  },
  'PATCH /api/locations/:id': async (client) => {
    expect((await client.patch(`/api/locations/${b.location}`).send({ name: 'Volé' })).status).toBe(
      404,
    );
  },
  'POST /api/shelves': async (client) => {
    const res = await client
      .post('/api/shelves')
      .send({ locationId: b.location, name: 'Intruse', kind: 'plain' });
    expect(res.status).toBe(404);
  },
  'PATCH /api/shelves/:id': async (client) => {
    expect((await client.patch(`/api/shelves/${b.shelf}`).send({ name: 'Volée' })).status).toBe(
      404,
    );
    // An empty shelf of A cannot move into a location of B.
    const [empty] = await q<{ id: number }>(
      `SELECT id FROM shelves WHERE household_id = $1 AND location_id = $2 ORDER BY sort_order DESC LIMIT 1`,
      [A, a.otherLocation],
    );
    expect(
      (await client.patch(`/api/shelves/${empty!.id}`).send({ locationId: b.location })).status,
    ).toBe(404);
  },
  'DELETE /api/shelves/:id': async (client) => {
    expect((await client.delete(`/api/shelves/${b.shelf}`)).status).toBe(404);
  },
  'GET /api/categories': async (client, who) => {
    const res = await client.get('/api/categories');
    const ids = res.body.map((c: { id: number }) => c.id);
    expect(ids).toContain(a.category);
    expect(ids).not.toContain(b.category);
    assertNothingOfB(res.body, `${who} categories`);
    assertNoHousehold(res.body, `${who} categories`);
  },
  'GET /api/products': async (client, who) => {
    for (const query of ['', `?q=${encodeURIComponent('Gâteau')}`, `?q=${MARK_B}`, '?q=marque']) {
      const res = await client.get(`/api/products${query}`);
      expect(res.status).toBe(200);
      expect(res.body.map((p: { id: number }) => p.id)).not.toContain(b.product);
      assertNothingOfB(res.body, `${who} products${query}`);
      assertNoHousehold(res.body, `${who} products${query}`);
    }
  },
  'GET /api/products/:id': async (client) => {
    expect((await client.get(`/api/products/${b.product}`)).status).toBe(404);
  },
  'POST /api/products': async (client) => {
    for (const body of [
      { name: 'Intrus', categoryId: b.category },
      { name: 'Intrus', categoryId: a.category, defaultLocationId: b.location },
    ]) {
      const res = await client.post('/api/products').send(body);
      expect(res.status).toBe(404);
      assertNoHousehold(res.body, 'create product');
    }
  },
  'PATCH /api/products/:id': async (client) => {
    expect((await client.patch(`/api/products/${b.product}`).send({ name: 'Volé' })).status).toBe(
      404,
    );
    expect(
      (await client.patch(`/api/products/${a.product}`).send({ categoryId: b.category })).status,
    ).toBe(404);
    expect(
      (await client.patch(`/api/products/${a.product}`).send({ defaultLocationId: b.location }))
        .status,
    ).toBe(404);
  },
  'POST /api/products/:id/merge': async (client) => {
    // Neither as the merged product nor as the kept one: B's products are unknown to A.
    expect(
      (await client.post(`/api/products/${b.product}/merge`).send({ intoProductId: a.product }))
        .status,
    ).toBe(404);
    expect(
      (await client.post(`/api/products/${a.product}/merge`).send({ intoProductId: b.product }))
        .status,
    ).toBe(404);
    expect(
      (await client.post(`/api/products/${a.product}/merge`).send({ intoProductId: a.product }))
        .status,
    ).toBe(400);
    const [line] = await q<{ merged_into_id: number | null }>(
      'SELECT merged_into_id FROM products WHERE id = ANY($1)',
      [[a.product, b.product]],
    );
    expect(line!.merged_into_id).toBeNull();
  },
  'POST /api/products/:id/barcode': async (client, who) => {
    expect(
      (await client.post(`/api/products/${b.product}/barcode`).send({ barcode: '5449000000996' }))
        .status,
    ).toBe(404);
    // The code of B is not taken in A: the same code can be attached to a product of A.
    const created = await client
      .post('/api/products')
      .send({ name: `Sans code ${who}`, categoryId: a.category });
    expect(created.status).toBe(201);
    const res = await client
      .post(`/api/products/${created.body.id}/barcode`)
      .send({ barcode: b.barcode });
    expect(res.status).toBe(200);
    // Put back: A must not keep knowing the code of B for the other checks.
    await q('UPDATE products SET barcode = NULL WHERE id = $1', [created.body.id]);
    assertNothingOfB(res.body, `${who} barcode`);
    assertNoHousehold(res.body, `${who} barcode`);
  },
  'GET /api/products/:id/movements': async (client) => {
    expect((await client.get(`/api/products/${b.product}/movements`)).status).toBe(404);
    const mine = await client.get(`/api/products/${a.product}/movements`);
    assertNothingOfB(mine.body, 'movements');
    assertNoHousehold(mine.body, 'movements');
  },
  'POST /api/products/:id/image': async (client) => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#996633' },
    })
      .jpeg()
      .toBuffer();
    const res = await client
      .post(`/api/products/${b.product}/image`)
      .attach('image', jpeg, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  },
  'GET /api/images/:file': async (client) => {
    expect((await client.get(`/api/images/${b.image}`)).status).toBe(404);
    expect((await client.get(`/api/images/${a.image}`)).status).toBe(200);
  },
  'GET /api/scan/:barcode': async (client) => {
    // B knows this code; A does not: catalog only, nothing created, never B's card.
    const res = await client.get(`/api/scan/${b.barcode}?catalogOnly=true`);
    expect(res.body).toEqual({ status: 'unknown', reason: 'not_found' });
  },
  'GET /api/stock': async (client, who) => {
    for (const query of [
      '',
      `?location=${b.location}`,
      `?category=${b.category}`,
      `?q=${MARK_B}`,
    ]) {
      const res = await client.get(`/api/stock${query}`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((i: { id: number }) => i.id)).not.toContain(b.stockItem);
      expect(res.body.counts.map((c: { locationId: number }) => c.locationId)).not.toContain(
        b.location,
      );
      assertNothingOfB(res.body, `${who} stock${query}`);
      assertNoHousehold(res.body, `${who} stock${query}`);
    }
  },
  'POST /api/stock/adjust': async (client) => {
    const base = { delta: 1, reason: 'manual' };
    expect(
      (
        await client
          .post('/api/stock/adjust')
          .send({ ...base, productId: b.product, locationId: a.location })
      ).status,
    ).toBe(404);
    expect(
      (
        await client
          .post('/api/stock/adjust')
          .send({ ...base, productId: a.product, locationId: b.location })
      ).status,
    ).toBe(404);
    // A shelf of B on a location of A: refused before anything is written.
    expect(
      (
        await client
          .post('/api/stock/adjust')
          .send({ ...base, productId: a.product, locationId: a.location, shelfId: b.shelf })
      ).status,
    ).toBe(400);
  },
  'POST /api/stock/move': async (client) => {
    expect(
      (
        await client
          .post('/api/stock/move')
          .send({ stockItemId: b.stockItem, toLocationId: a.location, quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await client
          .post('/api/stock/move')
          .send({ stockItemId: a.stockItem, toLocationId: b.location, quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await client.post('/api/stock/move').send({
          stockItemId: a.stockItem,
          toLocationId: a.location,
          toShelfId: b.shelf,
          quantity: 1,
        })
      ).status,
    ).toBe(400);
  },
  'POST /api/stock/remove': async (client) => {
    expect((await client.post('/api/stock/remove').send({ productId: b.product })).status).toBe(
      404,
    );
  },
  'GET /api/sync/catalog': async (client, who) => {
    const res = await client.get('/api/sync/catalog');
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: number }) => p.id);
    expect(ids).toContain(a.product);
    expect(ids).not.toContain(b.product);
    assertNothingOfB(res.body, `${who} catalog`);
    assertNoHousehold(res.body, `${who} catalog`);
  },
  'POST /api/sync': async (client) => {
    const base = {
      kind: 'add',
      deviceId: 'device-isolation',
      createdAt: '2026-06-01T09:00:00.000Z',
      quantity: 1,
    };
    // Products and locations of B are unknown to A: rejected, nothing written.
    const res = await client.post('/api/sync').send({
      ops: [
        {
          ...base,
          key: `iso-product-${Math.random()}`,
          productId: b.product,
          locationId: a.location,
        },
        {
          ...base,
          key: `iso-location-${Math.random()}`,
          productId: a.product,
          locationId: b.location,
        },
        { ...base, key: `iso-remove-${Math.random()}`, kind: 'remove', productId: b.product },
        { ...base, key: SHARED_KEY, productId: a.product, locationId: a.location },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
      'duplicate',
    ]);
    assertNothingOfB(res.body, 'sync');
    const rows = await q('SELECT 1 FROM idempotency_keys WHERE household_id = $1', [B]);
    expect(rows).toHaveLength(1);
  },
  'GET /api/shopping': async (client, who) => {
    const res = await client.get('/api/shopping');
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: number }) => i.id);
    expect(ids).toContain(a.shopping);
    expect(ids).not.toContain(b.shopping);
    assertNothingOfB(res.body, `${who} shopping`);
    assertNoHousehold(res.body, `${who} shopping`);
  },
  'POST /api/shopping': async (client) => {
    // A product of B is unknown to A.
    expect((await client.post('/api/shopping').send({ productId: b.product })).status).toBe(404);
    expect(
      (await client.post('/api/shopping').send({ label: 'Intrus', householdId: B })).status,
    ).toBe(400);
  },
  'PATCH /api/shopping/:id': async (client) => {
    expect(
      (await client.patch(`/api/shopping/${b.shopping}`).send({ checked: false })).status,
    ).toBe(404);
    expect((await client.patch(`/api/shopping/${b.shopping}`).send({ quantity: 9 })).status).toBe(
      404,
    );
  },
  'DELETE /api/shopping/:id': async (client) => {
    expect((await client.delete(`/api/shopping/${b.shopping}`)).status).toBe(404);
  },
  'POST /api/shopping/clear-checked': async (client) => {
    // B's line is checked, A's is not: only B's would go if the route crossed households.
    const res = await client.post('/api/shopping/clear-checked');
    expect(res.status).toBe(200);
    const [line] = await q('SELECT 1 FROM shopping_items WHERE id = $1', [b.shopping]);
    expect(line).toBeDefined();
  },
  'POST /api/shopping/store-checked': async (client, who) => {
    const res = await client.post('/api/shopping/store-checked');
    expect(res.status).toBe(200);
    assertNothingOfB(res.body, `${who} store-checked`);
    assertNoHousehold(res.body, `${who} store-checked`);
    const [stock] = await q<{ quantity: number }>(
      'SELECT quantity FROM stock_items WHERE id = $1',
      [b.stockItem],
    );
    expect(stock!.quantity).toBe(3);
    const [line] = await q('SELECT 1 FROM shopping_items WHERE id = $1', [b.shopping]);
    expect(line).toBeDefined();
  },
  'GET /api/shopping/recent': async (client, who) => {
    const res = await client.get('/api/shopping/recent');
    expect(res.status).toBe(200);
    expect(res.body.map((p: { productId: number }) => p.productId)).not.toContain(b.product);
    assertNothingOfB(res.body, `${who} recent`);
    assertNoHousehold(res.body, `${who} recent`);
  },
  'GET /api/home': async (client, who) => {
    const res = await client.get('/api/home');
    expect(res.status).toBe(200);
    const ids = res.body.locations.map((l: { id: number }) => l.id);
    expect(ids).toContain(a.location);
    expect(ids).not.toContain(b.location);
    assertNothingOfB(res.body, `${who} home`);
    assertNoHousehold(res.body, `${who} home`);
  },
  'GET /api/settings': async (client) => {
    // B changed its threshold; A keeps the default.
    expect((await client.get('/api/settings')).body).toEqual({ expiryAlertDays: 3 });
  },
  'GET /api/stock/summary': async (client) => {
    // A holds one product expiring tomorrow; B's line (also tomorrow) is not counted.
    const res = await client.get('/api/stock/summary');
    expect(res.body).toMatchObject({ inStock: 1, expired: 0, expiryAlertDays: 3 });
    // Paris and the database may disagree on "today" around midnight: tomorrow is one or the other.
    expect(res.body.today + res.body.soon).toBe(1);
  },
  'GET /api/stats': async (client, who) => {
    const res = await client.get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ consumed: 2, wasted: 0, topWasted: [] });
    assertNothingOfB(res.body, `${who} stats`);
    assertNoHousehold(res.body, `${who} stats`);
  },
  'GET /api/push/public-key': async (client) => {
    expect((await client.get('/api/push/public-key')).body).toEqual({ publicKey: null });
  },
  'POST /api/push/subscriptions': async (client) => {
    // B's endpoint: A gets a row of its own, B's row is left alone (checked by the snapshot).
    const res = await client
      .post('/api/push/subscriptions')
      .send({ endpoint: B_ENDPOINT, keys: { p256dh: 'pa', auth: 'aa' } });
    expect(res.status).toBe(204);
    const rows = await q<{ household_id: number; p256dh: string }>(
      'SELECT household_id, p256dh FROM push_subscriptions WHERE endpoint = $1 ORDER BY household_id',
      [B_ENDPOINT],
    );
    expect(rows.find((r) => r.household_id === B)!.p256dh).toBe('pb');
  },
  'DELETE /api/push/subscriptions': async (client) => {
    expect(
      (await client.delete('/api/push/subscriptions').send({ endpoint: B_ENDPOINT })).status,
    ).toBe(204);
    const rows = await q('SELECT 1 FROM push_subscriptions WHERE household_id = $1', [B]);
    expect(rows).toHaveLength(1);
  },
  'ALL /api/{*path}': async (client) => {
    expect((await client.get('/api/route-inconnue')).status).toBe(404);
  },
};

/** Admin console routes (D2): 404 for a member, whatever the household in the path. */
const CONSOLE: Record<string, (client: Client) => Promise<request.Response>> = {
  'GET /api/users': (c) => c.get('/api/users'),
  'POST /api/users': (c) =>
    c.post('/api/users').send({ username: 'pirate', password: 'motdepasse1', householdId: A }),
  'PATCH /api/users/:id': (c) => c.patch('/api/users/1').send({ householdId: B }),
  'DELETE /api/users/:id': (c) => c.delete('/api/users/1'),
  'GET /api/admin/households': (c) => c.get('/api/admin/households'),
  'POST /api/admin/households': (c) => c.post('/api/admin/households').send({ name: 'Pirate' }),
  'PATCH /api/admin/households/:id': (c) =>
    c.patch(`/api/admin/households/${B}`).send({ name: 'Pirate' }),
  'DELETE /api/admin/households/:id': (c) =>
    c.delete(`/api/admin/households/${B}`).send({ confirmName: NAME_B }),
  'GET /api/admin/households/:id/settings': (c) => c.get(`/api/admin/households/${B}/settings`),
  'PATCH /api/admin/households/:id/settings': (c) =>
    c.patch(`/api/admin/households/${B}/settings`).send({ expiryAlertDays: 1 }),
  'GET /api/admin/households/:id/categories': (c) => c.get(`/api/admin/households/${B}/categories`),
  'POST /api/admin/households/:id/categories': (c) =>
    c.post(`/api/admin/households/${B}/categories`).send({ name: 'Pirate', icon: 'wine' }),
  'PATCH /api/admin/households/:id/categories/:categoryId': (c) =>
    c.patch(`/api/admin/households/${B}/categories/${b.category}`).send({ name: 'Pirate' }),
  'DELETE /api/admin/households/:id/categories/:categoryId': (c) =>
    c.delete(`/api/admin/households/${B}/categories/${b.category}`),
  'GET /api/admin/households/:id/off-category-map': (c) =>
    c.get(`/api/admin/households/${B}/off-category-map`),
  'POST /api/admin/households/:id/off-category-map': (c) =>
    c
      .post(`/api/admin/households/${B}/off-category-map`)
      .send({ offTag: 'en:pirate', categoryId: b.category }),
  'PATCH /api/admin/households/:id/off-category-map/:mapId': (c) =>
    c.patch(`/api/admin/households/${B}/off-category-map/${b.mapping}`).send({ offTag: 'en:x' }),
  'DELETE /api/admin/households/:id/off-category-map/:mapId': (c) =>
    c.delete(`/api/admin/households/${B}/off-category-map/${b.mapping}`),
};

/** Not routes of a controller: the household scope middleware applied to every path. */
const NOT_ROUTES = new Set(['ALL /api', 'ALL /api/{*path}/']);

let before: string;

beforeAll(async () => {
  app = await createTestApp();
  await resetAll();
  await seedHousehold(app);
  A = HOUSEHOLD;
  await q('UPDATE households SET name = $1 WHERE id = $2', [NAME_A, A]);
  B = await createHousehold(app, NAME_B);
  await createUser(app, { username: 'alice', password: 'motdepasse1' });
  await createUser(app, { username: 'root', password: 'motdepasse1', role: 'admin' });
  await createUser(app, { username: 'bob', password: 'motdepasse1', householdId: B });
  a = await fill(A, 'Alpha', '5449000000996');
  b = await fill(B, MARK_B, '3017620422003');
  // Comfort data of phase 3: B has its own threshold, consumption, waste and device.
  const [userB] = await q<{ id: number }>('SELECT id FROM users WHERE household_id = $1', [B]);
  const [userA] = await q<{ id: number }>('SELECT id FROM users WHERE household_id = $1 LIMIT 1', [
    A,
  ]);
  await q('INSERT INTO settings (household_id, expiry_alert_days) VALUES ($1, 9)', [B]);
  await q(
    `INSERT INTO push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, 'pb', 'ab')`,
    [B, userB!.id, B_ENDPOINT],
  );
  for (const [household, product, user, delta, reason] of [
    [B, b.product, userB!.id, -7, 'consumed'],
    [B, b.product, userB!.id, -5, 'wasted'],
    [A, a.product, userA!.id, -2, 'consumed'],
  ] as const) {
    await q(
      `INSERT INTO stock_movements (household_id, product_id, location_id, location_name, delta,
         reason, user_id)
       VALUES ($1, $2, $3, 'Frigo', $4, $5, $6)`,
      [household, product, household === B ? b.location : a.location, delta, reason, user],
    );
  }
  alice = await login('alice');
  root = await login('root');
  bob = await login('bob');
  before = await snapshotB();
});

afterAll(async () => {
  await app.close();
});

describe('isolation of the households, route by route', () => {
  it('has a check for every route of the API', () => {
    const covered = new Set([...Object.keys(checks), ...Object.keys(CONSOLE), ...NOT_ROUTES]);
    const routes = listRoutes(app);
    // The listing itself works: it finds the routes written in the controllers.
    expect(routes).toEqual(expect.arrayContaining(['GET /api/home', 'POST /api/stock/move']));
    expect(routes.length).toBeGreaterThan(30);
    const missing = routes.filter((route) => !covered.has(route));
    expect(missing, 'routes sans test d’isolation').toEqual([]);
  });

  it.each([
    ['alice (member of A)', () => alice],
    ['root (admin of A)', () => root],
  ])('lets %s touch nothing of B', async (who, cookie) => {
    for (const [route, check] of Object.entries(checks)) {
      try {
        await check(as(cookie()), who);
      } catch (error) {
        throw new Error(`${route} (${who}) : ${(error as Error).message}`);
      }
    }
  });

  it('answers 404 to a member on every route of the admin console', async () => {
    for (const [route, call] of Object.entries(CONSOLE)) {
      const res = await call(as(alice));
      expect(res.status, route).toBe(404);
      assertNoHousehold(res.body, route);
    }
  });

  it('leaves every row of B exactly as it was', async () => {
    expect(await snapshotB()).toBe(before);
  });

  it('works the same way the other way round: B sees nothing of A', async () => {
    const home = await as(bob).get('/api/home');
    expect(home.body.locations.map((l: { id: number }) => l.id)).not.toContain(a.location);
    expect(JSON.stringify(home.body)).not.toContain('Alpha');
    expect((await as(bob).get(`/api/products/${a.product}`)).status).toBe(404);
    expect((await as(bob).get(`/api/images/${a.image}`)).status).toBe(404);
    const products = await as(bob).get('/api/products?q=alpha');
    expect(products.body).toEqual([]);
  });

  it('never applies a household sent by a member in a request body', async () => {
    const attempts: [string, () => request.Test][] = [
      [
        'POST /api/products',
        () =>
          as(alice)
            .post('/api/products')
            .send({ name: 'X', categoryId: a.category, householdId: B }),
      ],
      [
        'PATCH /api/products/:id',
        () => as(alice).patch(`/api/products/${a.product}`).send({ householdId: B }),
      ],
      [
        'PATCH /api/locations/:id',
        () => as(alice).patch(`/api/locations/${a.location}`).send({ householdId: B }),
      ],
      [
        'POST /api/stock/adjust',
        () =>
          as(alice).post('/api/stock/adjust').send({
            productId: a.product,
            locationId: a.location,
            delta: 1,
            reason: 'manual',
            householdId: B,
          }),
      ],
      [
        'POST /api/stock/move',
        () =>
          as(alice).post('/api/stock/move').send({
            stockItemId: a.stockItem,
            toLocationId: a.otherLocation,
            quantity: 1,
            householdId: B,
          }),
      ],
      [
        'POST /api/auth/password',
        () =>
          as(alice)
            .post('/api/auth/password')
            .send({ currentPassword: 'x', newPassword: 'motdepasse2', householdId: B }),
      ],
    ];
    for (const [route, send] of attempts) {
      const res = await send();
      // Refused (strict validation) or, at worst, ignored: never applied.
      expect([400, 403, 404], route).toContain(res.status);
    }
    const [account] = await q<{ household_id: number }>(
      `SELECT household_id FROM users WHERE username = 'alice'`,
    );
    expect(account!.household_id).toBe(A);
    expect(await snapshotB()).toBe(before);
  });
});
