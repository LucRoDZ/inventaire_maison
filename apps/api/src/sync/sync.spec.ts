import type { INestApplication } from '@nestjs/common';
import { SYNC_MAX_OPS, type SyncOp, type SyncResult } from '@inventaire/shared';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createHousehold,
  createUser,
  DAY,
  FakeClock,
  ORIGIN,
  ownerDb,
  ownerPool,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { categories, locations, products, stockItems } from '../database/schema';
import { movementDate, SyncService } from './sync.service';

const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z'));
let app: INestApplication;
let cookie: string;
let fridge: number;
let milk: number;
let seq = 0;
const server = () => app.getHttpServer();
const db = () => ownerDb();

const op = (fields: Record<string, unknown>): SyncOp =>
  ({
    kind: 'add',
    key: `key-${++seq}-aaaaaaaa`,
    deviceId: 'device-aaaaaaaa',
    createdAt: '2026-06-01T09:00:00.000Z',
    productId: milk,
    quantity: 1,
    ...fields,
  }) as SyncOp;

const sync = async (ops: SyncOp[], who = cookie) =>
  request(server()).post('/api/sync').set('Cookie', who).set('Origin', ORIGIN).send({ ops });

async function results(ops: SyncOp[], who = cookie): Promise<SyncResult[]> {
  const res = await sync(ops, who);
  expect(res.status).toBe(200);
  return res.body.results;
}

const total = async (productId: number) =>
  (await db().select().from(stockItems).where(eq(stockItems.productId, productId))).reduce(
    (sum, row) => sum + row.quantity,
    0,
  );

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

async function newProduct(name: string, defaultLocationId: number | null = fridge) {
  const [cat] = await db().select().from(categories).where(eq(categories.name, 'Autre'));
  const [row] = await db()
    .insert(products)
    .values({ name, categoryId: cat!.id, searchText: name.toLowerCase(), defaultLocationId })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  app = await createTestApp({ clock });
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetAll();
  await seedHousehold(app);
  await createUser(app, { username: 'membre', password: 'motdepasse1' });
  cookie = await login('membre');
  const locs = await db().select().from(locations).orderBy(asc(locations.sortOrder));
  fridge = locs.find((l) => l.kind === 'fridge')!.id;
  milk = await newProduct('Lait');
});

describe('POST /sync', () => {
  it('adds stock in the usual location and replays without a second effect', async () => {
    const add = op({ quantity: 2 });
    expect(await results([add])).toEqual([{ key: add.key, status: 'applied' }]);
    expect(await total(milk)).toBe(2);
    expect(await results([add])).toEqual([{ key: add.key, status: 'duplicate', first: 'applied' }]);
    expect(await total(milk)).toBe(2);
    const keys = await ownerPool().query('SELECT * FROM idempotency_keys');
    expect(keys.rows).toHaveLength(1);
  });

  it('keeps the order and removes the requested quantity', async () => {
    const res = await results([
      op({ quantity: 3 }),
      op({ kind: 'remove', quantity: 2, reason: 'wasted' }),
    ]);
    expect(res.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(await total(milk)).toBe(1);
    const moves = await ownerPool().query(
      "SELECT reason FROM stock_movements WHERE reason = 'wasted'",
    );
    expect(moves.rows).toHaveLength(2);
  });

  it('answers conflicts without any effect, and does not keep their key', async () => {
    const insufficient = op({ kind: 'remove', quantity: 1 });
    const [r1] = await results([insufficient]);
    expect(r1).toEqual({
      key: insufficient.key,
      status: 'conflict',
      conflict: 'insufficient_stock',
    });

    const nowhere = await newProduct('Sans lieu', null);
    const [r2] = await results([op({ productId: nowhere })]);
    expect(r2).toMatchObject({ status: 'conflict', conflict: 'no_location' });
    expect(await total(nowhere)).toBe(0);

    const target = await newProduct('Cible');
    const old = await newProduct('Ancien');
    await ownerPool().query('UPDATE products SET merged_into_id = $1 WHERE id = $2', [target, old]);
    const [r3] = await results([op({ productId: old })]);
    expect(r3).toMatchObject({ status: 'conflict', conflict: 'merged', mergedIntoId: target });

    const keys = await ownerPool().query('SELECT 1 FROM idempotency_keys');
    expect(keys.rows).toHaveLength(0);
    // The same key can be retried once the situation is fixed.
    await results([op({ quantity: 1 })]);
    expect(await results([{ ...insufficient }])).toMatchObject([{ status: 'applied' }]);
  });

  it('rejects unknown objects and keeps processing the next operations', async () => {
    const res = await results([
      op({ productId: 999_999 }),
      op({ locationId: 999_999 }),
      op({ quantity: 1 }),
    ]);
    expect(res.map((r) => r.status)).toEqual(['rejected', 'rejected', 'applied']);
    expect(await total(milk)).toBe(1);
  });

  it('refuses a malformed request and more than the maximum of operations', async () => {
    expect((await sync([op({ quantity: 0 })])).status).toBe(400);
    expect((await sync([op({ key: 'court' })])).status).toBe(400);
    const many = Array.from({ length: SYNC_MAX_OPS + 1 }, () => op({}));
    expect((await sync(many)).status).toBe(400);
    expect(await total(milk)).toBe(0);
  });

  it('accepts the same key in two households and touches nothing outside its own', async () => {
    const other = await createHousehold(app, 'Autre foyer');
    await createUser(app, { username: 'voisin', password: 'motdepasse1', householdId: other });
    const neighbour = await login('voisin');
    const { rows } = await ownerPool().query(
      `INSERT INTO products (household_id, name, search_text, category_id)
       VALUES ($1, 'Lait voisin', 'lait voisin', (SELECT id FROM categories WHERE household_id = $1 LIMIT 1))
       RETURNING id`,
      [other],
    );
    const theirs = rows[0].id as number;

    const shared = op({ key: 'shared-key-0001', quantity: 1 });
    expect(await results([shared])).toMatchObject([{ status: 'applied' }]);
    // A product of the other household is unknown here.
    expect(await results([op({ productId: theirs })])).toMatchObject([{ status: 'rejected' }]);
    expect(await total(theirs)).toBe(0);
    // Same key, other household: no collision, and an effect of its own.
    const mine = { ...shared, productId: theirs, locationId: undefined } as SyncOp;
    const { rows: locs } = await ownerPool().query(
      'SELECT id FROM locations WHERE household_id = $1 LIMIT 1',
      [other],
    );
    expect(await results([{ ...mine, locationId: locs[0].id } as SyncOp], neighbour)).toMatchObject(
      [{ status: 'applied' }],
    );
    expect(await total(theirs)).toBe(1);
    const keys = await ownerPool().query(
      "SELECT household_id FROM idempotency_keys WHERE key = 'shared-key-0001' ORDER BY 1",
    );
    expect(keys.rows).toHaveLength(2);
  });

  it('puts a product on the shopping list once: replay, existing line, merged and foreign products', async () => {
    const lines = async (productId: number) =>
      (await ownerPool().query('SELECT * FROM shopping_items WHERE product_id = $1', [productId]))
        .rows;
    const shop = op({ kind: 'shop', quantity: 2 });
    expect(await results([shop])).toEqual([{ key: shop.key, status: 'applied' }]);
    expect(await results([shop])).toEqual([
      { key: shop.key, status: 'duplicate', first: 'applied' },
    ]);
    expect(await lines(milk)).toHaveLength(1);
    // A new key on a product already listed: applied, no second line, quantity untouched.
    expect(await results([op({ kind: 'shop' })])).toMatchObject([{ status: 'applied' }]);
    expect(await lines(milk)).toHaveLength(1);
    expect((await lines(milk))[0].quantity).toBe(2);
    // A checked line counts too.
    await ownerPool().query('UPDATE shopping_items SET checked = true WHERE product_id = $1', [
      milk,
    ]);
    expect(await results([op({ kind: 'shop' })])).toMatchObject([{ status: 'applied' }]);
    expect(await lines(milk)).toHaveLength(1);

    const target = await newProduct('Cible');
    const old = await newProduct('Ancien');
    await ownerPool().query('UPDATE products SET merged_into_id = $1 WHERE id = $2', [target, old]);
    expect(await results([op({ kind: 'shop', productId: old })])).toMatchObject([
      { status: 'conflict', conflict: 'merged', mergedIntoId: target },
    ]);
    expect(await lines(old)).toHaveLength(0);
  });

  it('rejects a shop operation on a product of another household', async () => {
    const other = await createHousehold(app, 'Autre foyer');
    await createUser(app, { username: 'voisin', password: 'motdepasse1', householdId: other });
    const neighbour = await login('voisin');
    const { rows } = await ownerPool().query(
      `INSERT INTO products (household_id, name, search_text, category_id)
       VALUES ($1, 'Lait voisin', 'lait voisin', (SELECT id FROM categories WHERE household_id = $1 LIMIT 1))
       RETURNING id`,
      [other],
    );
    const theirs = rows[0].id as number;
    expect(await results([op({ kind: 'shop', productId: theirs })])).toMatchObject([
      { status: 'rejected' },
    ]);
    expect(await results([op({ kind: 'shop', productId: milk })], neighbour)).toMatchObject([
      { status: 'rejected' },
    ]);
    const all = await ownerPool().query('SELECT 1 FROM shopping_items');
    expect(all.rows).toHaveLength(0);
  });

  it('requires a session', async () => {
    const res = await request(server()).post('/api/sync').set('Origin', ORIGIN).send({ ops: [] });
    expect(res.status).toBe(401);
  });
});

describe('date of a queued add', () => {
  const now = new Date('2026-11-27T12:00:00.000Z');
  it('keeps a real date of the last 30 days, else the server time', () => {
    expect(movementDate('2026-11-20T08:00:00.000Z', now)?.toISOString()).toBe(
      '2026-11-20T08:00:00.000Z',
    );
    expect(movementDate('2026-10-01T08:00:00.000Z', now)).toBeUndefined();
    expect(movementDate('2026-11-28T08:00:00.000Z', now)).toBeUndefined();
    expect(movementDate('pas une date', now)).toBeUndefined();
  });

  it('dates the movement with the date of the device', async () => {
    const day = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const add = op({ createdAt: day });
    expect(await results([add])).toEqual([{ key: add.key, status: 'applied' }]);
    const rows = await ownerPool().query<{ created_at: Date }>(
      'SELECT created_at FROM stock_movements WHERE product_id = $1',
      [milk],
    );
    expect(rows.rows.map((r) => r.created_at.toISOString())).toEqual([day]);
  });
});

describe('GET /sync/catalog', () => {
  it('lists the products of the household, merged ones excluded', async () => {
    const old = await newProduct('Ancien');
    await ownerPool().query('UPDATE products SET merged_into_id = $1 WHERE id = $2', [milk, old]);
    const res = await request(server()).get('/api/sync/catalog').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: milk, name: 'Lait', barcode: null, defaultLocationId: fridge },
    ]);
  });
});

describe('purge of the keys', () => {
  it('deletes the keys older than the retention period only', async () => {
    await results([op({})]);
    // Keys are stamped by the database clock: align them on the fake clock.
    await ownerPool().query('UPDATE idempotency_keys SET created_at = $1', [clock.now()]);
    const service = app.get(SyncService);
    expect(await service.purgeExpired(1)).toBe(0);
    clock.advance(13 * DAY);
    expect(await service.purgeExpired(1)).toBe(0);
    clock.advance(2 * DAY);
    expect(await service.purgeExpired(1)).toBe(1);
  });
});
