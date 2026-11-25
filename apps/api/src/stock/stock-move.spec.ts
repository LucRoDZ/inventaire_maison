import type { INestApplication } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import {
  categories,
  locations,
  products,
  shelves,
  stockItems,
  stockMovements,
  users,
} from '../database/schema';

let app: INestApplication;
let cookie: string;
let productId: number;
let fridgeId: number;
let pantryId: number;
let fridgeShelves: number[];
let pantryShelfId: number;
let memberId: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();

const post = (url: string, body: Record<string, unknown>) =>
  request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
const get = (url: string) => request(server()).get(url).set('Cookie', cookie);

async function addLine(values: {
  productId?: number;
  locationId?: number;
  shelfId?: number | null;
  quantity: number;
  expiryDate?: string | null;
  createdAt?: Date;
}) {
  const [row] = await db()
    .insert(stockItems)
    .values({ productId, locationId: fridgeId, ...values })
    .returning();
  return row!;
}
const lines = () => db().select().from(stockItems).orderBy(asc(stockItems.id));

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
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
  memberId = await createUser(app, { username: 'membre', password: 'motdepasse1' });
  cookie = await login('membre');

  const [category] = await db().select().from(categories).limit(1);
  const [product] = await db()
    .insert(products)
    .values({ name: 'Lait', categoryId: category!.id, searchText: 'lait' })
    .returning();
  productId = product!.id;
  const locs = await db().select().from(locations);
  const fridge = locs.find((l) => l.kind === 'fridge')!;
  const pantry = locs.find((l) => l.kind === 'pantry')!;
  fridgeId = fridge.id;
  pantryId = pantry.id;
  fridgeShelves = (
    await db().select().from(shelves).where(eq(shelves.locationId, fridge.id)).orderBy(shelves.id)
  ).map((s) => s.id);
  pantryShelfId = (await db().select().from(shelves).where(eq(shelves.locationId, pantry.id)))[0]!
    .id;
});

describe('POST /api/stock/move', () => {
  it('requires a session', async () => {
    const res = await request(server()).post('/api/stock/move').set('Origin', ORIGIN).send({});
    expect(res.status).toBe(401);
  });

  it('moves part of a line and writes two opposite move movements', async () => {
    const line = await addLine({
      quantity: 5,
      shelfId: fridgeShelves[0]!,
      expiryDate: '2026-12-01',
    });
    const res = await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: fridgeId,
      toShelfId: fridgeShelves[1],
      quantity: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.from).toMatchObject({ quantity: 3, shelfId: fridgeShelves[0] });
    expect(res.body.to).toMatchObject({
      quantity: 2,
      shelfId: fridgeShelves[1],
      expiryDate: '2026-12-01',
    });
    const [out, into] = res.body.movements;
    expect(out).toMatchObject({
      delta: -2,
      reason: 'move',
      shelfId: fridgeShelves[0],
      userId: memberId,
    });
    expect(into).toMatchObject({ delta: 2, reason: 'move', shelfId: fridgeShelves[1] });
    expect(await lines()).toHaveLength(2);
  });

  it('moves a whole line to another location, to its tray', async () => {
    const line = await addLine({ quantity: 2 });
    const res = await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: pantryId,
      quantity: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.from).toBeNull();
    expect(res.body.to).toMatchObject({ locationId: pantryId, shelfId: null, quantity: 2 });
    const all = await lines();
    expect(all).toHaveLength(1);
    expect(all[0]?.locationId).toBe(pantryId);
  });

  it('merges into an identical line at the destination', async () => {
    const line = await addLine({ quantity: 2, expiryDate: '2026-12-01' });
    await addLine({ quantity: 3, shelfId: fridgeShelves[0]!, expiryDate: '2026-12-01' });
    await addLine({ quantity: 7, shelfId: fridgeShelves[0]!, expiryDate: '2026-12-02' });
    const res = await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: fridgeId,
      toShelfId: fridgeShelves[0],
      quantity: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.to.quantity).toBe(5);
    expect(await lines()).toHaveLength(2);
  });

  it('refuses the same origin and destination with 400', async () => {
    const line = await addLine({ quantity: 2, shelfId: fridgeShelves[0]! });
    const same = await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: fridgeId,
      toShelfId: fridgeShelves[0],
      quantity: 1,
    });
    expect(same.status).toBe(400);
    const tray = await addLine({ quantity: 2, expiryDate: '2026-12-01' });
    const sameTray = await post('/api/stock/move', {
      stockItemId: tray.id,
      toLocationId: fridgeId,
      quantity: 1,
    });
    expect(sameTray.status).toBe(400);
  });

  it('refuses a quantity above the stock with 409 and changes nothing', async () => {
    const line = await addLine({ quantity: 2 });
    const res = await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: pantryId,
      quantity: 3,
    });
    expect(res.status).toBe(409);
    expect((await lines())[0]?.quantity).toBe(2);
    expect(await db().select().from(stockMovements)).toHaveLength(0);
  });

  it('validates the body, the shelf and the identifiers', async () => {
    const line = await addLine({ quantity: 2 });
    const ok = { stockItemId: line.id, toLocationId: pantryId, quantity: 1 };
    expect((await post('/api/stock/move', { ...ok, quantity: 0 })).status).toBe(400);
    expect((await post('/api/stock/move', { ...ok, quantity: 1.5 })).status).toBe(400);
    expect((await post('/api/stock/move', { ...ok, extra: 1 })).status).toBe(400);
    expect((await post('/api/stock/move', { ...ok, toShelfId: fridgeShelves[0] })).status).toBe(
      400,
    );
    expect((await post('/api/stock/move', { ...ok, stockItemId: 9999 })).status).toBe(404);
    expect((await post('/api/stock/move', { ...ok, toLocationId: 9999 })).status).toBe(404);
    expect((await post('/api/stock/move', { ...ok, toShelfId: pantryShelfId })).status).toBe(200);
  });

  it('keeps the total of the product constant under concurrent moves', async () => {
    const line = await addLine({ quantity: 4 });
    const results = await Promise.all([
      post('/api/stock/move', { stockItemId: line.id, toLocationId: pantryId, quantity: 3 }),
      post('/api/stock/move', { stockItemId: line.id, toLocationId: pantryId, quantity: 3 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const total = (await lines()).reduce((sum, l) => sum + l.quantity, 0);
    expect(total).toBe(4);
  });
});

describe('POST /api/stock/remove', () => {
  it('removes one unit from the line with the nearest expiry date', async () => {
    await addLine({ quantity: 2, expiryDate: '2026-12-10' });
    await addLine({ quantity: 2, expiryDate: '2026-12-01', shelfId: fridgeShelves[1]! });
    await addLine({ quantity: 2 });
    const res = await post('/api/stock/remove', { productId });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ quantity: 1, expiryDate: '2026-12-01' });
    expect(res.body.movement).toMatchObject({ delta: -1, reason: 'scan_remove', userId: memberId });
    expect(res.body.product).toEqual({ id: productId, name: 'Lait' });
    expect(res.body.location).toMatchObject({ id: fridgeId, name: 'Frigo' });
    expect(res.body.shelf).toMatchObject({ id: fridgeShelves[1] });
  });

  it('takes the oldest line when none has a date, and deletes a line at zero', async () => {
    await addLine({ quantity: 1, locationId: pantryId, createdAt: new Date('2026-01-01') });
    await addLine({ quantity: 1, createdAt: new Date('2026-02-01') });
    const res = await post('/api/stock/remove', { productId });
    expect(res.status).toBe(200);
    expect(res.body.item).toBeNull();
    expect(res.body.location.id).toBe(pantryId);
    expect(res.body.shelf).toBeNull();
    const rest = await lines();
    expect(rest).toHaveLength(1);
    expect(rest[0]?.locationId).toBe(fridgeId);
  });

  it('answers 404 "Pas en stock" without writing a movement', async () => {
    const res = await post('/api/stock/remove', { productId });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Pas en stock');
    expect(await db().select().from(stockMovements)).toHaveLength(0);
    expect((await post('/api/stock/remove', { productId: 9999 })).status).toBe(404);
    expect((await post('/api/stock/remove', {})).status).toBe(400);
  });

  it('never removes more than the stock under concurrent calls', async () => {
    await addLine({ quantity: 1 });
    const results = await Promise.all([
      post('/api/stock/remove', { productId }),
      post('/api/stock/remove', { productId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(await lines()).toHaveLength(0);
  });
});

describe('GET /api/products/{id}/movements', () => {
  it('requires a session and 404s on an unknown product', async () => {
    expect((await request(server()).get(`/api/products/${productId}/movements`)).status).toBe(401);
    expect((await get('/api/products/9999/movements')).status).toBe(404);
    expect((await get('/api/products/abc/movements')).status).toBe(404);
  });

  it('lists a move as two opposite lines, newest first, with author and places', async () => {
    const line = await addLine({ quantity: 3, shelfId: fridgeShelves[0]! });
    await post('/api/stock/move', {
      stockItemId: line.id,
      toLocationId: pantryId,
      toShelfId: pantryShelfId,
      quantity: 3,
    });
    const res = await get(`/api/products/${productId}/movements`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      delta: 3,
      reason: 'move',
      user: { id: memberId, username: 'membre' },
      location: { id: pantryId },
      shelf: { id: pantryShelfId },
    });
    expect(res.body.items[1]).toMatchObject({ delta: -3, reason: 'move' });
    expect(res.body.nextCursor).toBeNull();
  });

  it('names a disabled account and the right author for each movement', async () => {
    const otherId = await createUser(app, { username: 'autre', password: 'motdepasse1' });
    const otherCookie = await login('autre');
    await post('/api/stock/adjust', {
      productId,
      locationId: fridgeId,
      delta: 2,
      reason: 'manual',
    });
    await request(server())
      .post('/api/stock/adjust')
      .set('Cookie', otherCookie)
      .set('Origin', ORIGIN)
      .send({ productId, locationId: fridgeId, delta: 1, reason: 'manual' });
    await db().update(users).set({ disabledAt: new Date() }).where(eq(users.id, otherId));
    const res = await get(`/api/products/${productId}/movements`);
    expect(res.body.items.map((i: { user: { username: string } }) => i.user.username)).toEqual([
      'autre',
      'membre',
    ]);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 5; i += 1) {
      await post('/api/stock/adjust', {
        productId,
        locationId: fridgeId,
        delta: 1,
        reason: 'manual',
      });
    }
    const first = await get(`/api/products/${productId}/movements?limit=2`);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await get(
      `/api/products/${productId}/movements?limit=2&cursor=${first.body.nextCursor}`,
    );
    const third = await get(
      `/api/products/${productId}/movements?limit=2&cursor=${second.body.nextCursor}`,
    );
    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map(
      (i: { id: number }) => i.id,
    );
    expect(ids).toHaveLength(5);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    expect(third.body.nextCursor).toBeNull();
    expect((await get(`/api/products/${productId}/movements?limit=0`)).status).toBe(400);
  });
});
