import type { INestApplication } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, resetAuth } from '../../test/helpers';
import { DB, PG_POOL, type Database } from '../database/database.module';
import {
  categories,
  locations,
  products,
  shelves,
  stockItems,
  stockMovements,
  users,
} from '../database/schema';
import { SeedService } from '../database/seed/seed.service';

let app: INestApplication;
let cookie: string;
let productId: number;
let fridgeId: number;
let fridgeShelfId: number;
let pantryShelfId: number;
let memberId: number;
const server = () => app.getHttpServer();
const db = () => app.get<Database>(DB);

const adjust = (body: Record<string, unknown>) =>
  request(server())
    .post('/api/stock/adjust')
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .send(body);

const base = () => ({ productId, locationId: fridgeId, reason: 'manual' });

async function lines() {
  return db().select().from(stockItems).orderBy(asc(stockItems.id));
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAuth(app);
  await app
    .get<Pool>(PG_POOL)
    .query(
      'TRUNCATE stock_movements, stock_items, products, off_category_map, categories, shelves, locations RESTART IDENTITY CASCADE',
    );
  await app.get(SeedService).seed();
  memberId = await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(res, 'inv_session')}`;

  const [category] = await db().select().from(categories).limit(1);
  const [product] = await db()
    .insert(products)
    .values({ name: 'Lait', categoryId: category!.id, searchText: 'lait' })
    .returning();
  productId = product!.id;
  const locs = await db().select().from(locations).orderBy(asc(locations.sortOrder));
  const fridge = locs.find((l) => l.kind === 'fridge')!;
  const pantry = locs.find((l) => l.kind === 'pantry')!;
  fridgeId = fridge.id;
  fridgeShelfId = (await db().select().from(shelves).where(eq(shelves.locationId, fridge.id)))[0]!
    .id;
  pantryShelfId = (await db().select().from(shelves).where(eq(shelves.locationId, pantry.id)))[0]!
    .id;
});

describe('POST /api/stock/adjust', () => {
  it('requires a session', async () => {
    const res = await request(server()).post('/api/stock/adjust').set('Origin', ORIGIN).send({});
    expect(res.status).toBe(401);
  });

  it('creates a line and its movement, authored by the caller', async () => {
    const res = await adjust({
      ...base(),
      shelfId: fridgeShelfId,
      expiryDate: '2026-12-01',
      delta: 2,
      reason: 'scan_add',
    });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({
      productId,
      locationId: fridgeId,
      shelfId: fridgeShelfId,
      quantity: 2,
      expiryDate: '2026-12-01',
    });
    expect(res.body.movement).toMatchObject({
      delta: 2,
      reason: 'scan_add',
      userId: memberId,
      shelfId: fridgeShelfId,
      expiryDate: '2026-12-01',
    });
    expect(await lines()).toHaveLength(1);
  });

  it('adds to the line with the same key', async () => {
    await adjust({ ...base(), delta: 2 });
    const res = await adjust({ ...base(), delta: 3 });
    expect(res.body.item.quantity).toBe(5);
    expect(await lines()).toHaveLength(1);
  });

  it('keeps lines apart by expiry date, shelf and "no date"', async () => {
    await adjust({ ...base(), delta: 1, expiryDate: '2026-12-01' });
    await adjust({ ...base(), delta: 1, expiryDate: '2026-12-02' });
    await adjust({ ...base(), delta: 1 });
    await adjust({ ...base(), delta: 1, shelfId: fridgeShelfId });
    expect(await lines()).toHaveLength(4);
  });

  it('refuses a reason that contradicts the direction of the movement', async () => {
    await adjust({ ...base(), delta: 2 });
    expect((await adjust({ ...base(), delta: -1, reason: 'scan_add' })).status).toBe(400);
    expect((await adjust({ ...base(), delta: 1, reason: 'scan_remove' })).status).toBe(400);
    expect((await lines())[0]!.quantity).toBe(2);
  });

  it('deletes the line when it reaches zero', async () => {
    await adjust({ ...base(), delta: 2 });
    const res = await adjust({ ...base(), delta: -2, reason: 'scan_remove' });
    expect(res.status).toBe(200);
    expect(res.body.item).toBeNull();
    expect(res.body.movement.delta).toBe(-2);
    expect(await lines()).toHaveLength(0);
  });

  it('refuses to go below zero with 409 and leaves the quantity untouched', async () => {
    expect((await adjust({ ...base(), delta: 2 })).status).toBe(200);
    const res = await adjust({ ...base(), delta: -4 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Stock insuffisant');
    expect((await lines())[0]?.quantity).toBe(2);
    expect(await db().select().from(stockMovements)).toHaveLength(1);
  });

  it('refuses to remove from a line that does not exist', async () => {
    expect((await adjust({ ...base(), delta: -1 })).status).toBe(409);
  });

  it('keeps +2 then -4 at 409 with a quantity of 4 after an earlier +2', async () => {
    await adjust({ ...base(), delta: 2 });
    await adjust({ ...base(), delta: 2 });
    const res = await adjust({ ...base(), delta: -5 });
    expect(res.status).toBe(409);
    expect((await lines())[0]?.quantity).toBe(4);
  });

  it('returns 400 for a zero delta, a shelf of another location and a bad date', async () => {
    expect((await adjust({ ...base(), delta: 0 })).status).toBe(400);
    expect((await adjust({ ...base(), delta: 1, shelfId: pantryShelfId })).status).toBe(400);
    for (const expiryDate of ['2026-02-30', '01/12/2026', 'demain', '2026-13-01']) {
      expect((await adjust({ ...base(), delta: 1, expiryDate })).status, expiryDate).toBe(400);
    }
    expect((await adjust({ ...base(), delta: 1.5 })).status).toBe(400);
    expect((await adjust({ ...base(), delta: 1, reason: 'move' })).status).toBe(400);
    expect(await lines()).toHaveLength(0);
  });

  it('returns 404 for an unknown product, location or shelf', async () => {
    expect((await adjust({ ...base(), productId: 9999, delta: 1 })).status).toBe(404);
    expect((await adjust({ ...base(), locationId: 9999, delta: 1 })).status).toBe(404);
    expect((await adjust({ ...base(), delta: 1, shelfId: 9999 })).status).toBe(400);
  });

  it('sets the usual location of the product only when it is empty', async () => {
    await adjust({ ...base(), delta: 1 });
    const [first] = await db().select().from(products).where(eq(products.id, productId));
    expect(first?.defaultLocationId).toBe(fridgeId);
    const [other] = await db()
      .select()
      .from(locations)
      .where(sql`${locations.id} <> ${fridgeId}`)
      .limit(1);
    await adjust({ ...base(), locationId: other!.id, delta: 1 });
    const [second] = await db().select().from(products).where(eq(products.id, productId));
    expect(second?.defaultLocationId).toBe(fridgeId);
  });

  it('lets only one of two concurrent decrements of the last unit win', async () => {
    await adjust({ ...base(), delta: 1 });
    const results = await Promise.all([
      adjust({ ...base(), delta: -1 }),
      adjust({ ...base(), delta: -1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await lines()).toHaveLength(0);
  });

  it('creates a single line for concurrent first additions', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => adjust({ ...base(), delta: 1 })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const rows = await lines();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(4);
  });

  it('keeps the sum of the journal equal to the stock', async () => {
    await adjust({ ...base(), delta: 5 });
    await adjust({ ...base(), delta: -2, reason: 'scan_remove' });
    await adjust({ ...base(), delta: 4, shelfId: fridgeShelfId });
    await adjust({ ...base(), delta: -1, shelfId: fridgeShelfId, reason: 'correction' });
    const [journal] = await db()
      .select({ total: sql<number>`sum(${stockMovements.delta})::int` })
      .from(stockMovements);
    const [stock] = await db()
      .select({ total: sql<number>`sum(${stockItems.quantity})::int` })
      .from(stockItems);
    expect(journal?.total).toBe(6);
    expect(stock?.total).toBe(6);
    expect((await db().select().from(users)).length).toBeGreaterThan(0);
  });
});
