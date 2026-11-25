import type { INestApplication } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  FakeClock,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { categories, locations, products, shelves } from '../database/schema';

let app: INestApplication;
let cookie: string;
let productId: number;
let fridgeId: number;
let fridgeShelves: number[];
const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z'));
const server = () => app.getHttpServer();
const db = () => ownerDb();
const get = () => request(server()).get('/api/home').set('Cookie', cookie);
const adjust = (body: Record<string, unknown>) =>
  request(server())
    .post('/api/stock/adjust')
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .send({ productId, locationId: fridgeId, reason: 'manual', ...body });

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
  const fridge = (await db().select().from(locations)).find((l) => l.kind === 'fridge')!;
  fridgeId = fridge.id;
  fridgeShelves = (
    await db()
      .select()
      .from(shelves)
      .where(eq(shelves.locationId, fridge.id))
      .orderBy(asc(shelves.sortOrder))
  ).map((s) => s.id);
});

describe('GET /api/home', () => {
  it('requires a session', async () => {
    expect((await request(server()).get('/api/home')).status).toBe(401);
  });

  it('returns four empty furniture pieces on an empty stock', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(4);
    expect(res.body.locations.map((l: { kind: string }) => l.kind)).toEqual([
      'pantry',
      'fridge',
      'freezer',
      'cellar',
    ]);
    for (const place of res.body.locations) {
      expect(place.counts).toEqual({ products: 0, units: 0, expiringSoon: 0 });
      expect(place.unshelved).toEqual([]);
      expect(place.shelves.length).toBeGreaterThan(0);
      for (const shelf of place.shelves) expect(shelf.tiles).toEqual([]);
    }
  });

  it('shows a shelved product on its shelf only', async () => {
    await adjust({ delta: 3, shelfId: fridgeShelves[1] });
    const fridge = (await get()).body.locations.find((l: { id: number }) => l.id === fridgeId);
    expect(fridge.shelves.map((s: { id: number }) => s.id)).toEqual(fridgeShelves);
    expect(fridge.shelves[1].tiles).toHaveLength(1);
    expect(fridge.shelves[1].tiles[0]).toMatchObject({
      productId,
      name: 'Lait',
      brand: null,
      quantity: 3,
      imageUrl: null,
      category: { icon: expect.any(String) },
    });
    expect(fridge.shelves[0].tiles).toEqual([]);
    expect(fridge.unshelved).toEqual([]);
    expect(fridge.counts).toEqual({ products: 1, units: 3, expiringSoon: 0 });
  });

  it('shows an unshelved product in the tray', async () => {
    await adjust({ delta: 2 });
    const fridge = (await get()).body.locations.find((l: { id: number }) => l.id === fridgeId);
    expect(fridge.unshelved).toHaveLength(1);
    expect(fridge.unshelved[0].quantity).toBe(2);
    for (const shelf of fridge.shelves) expect(shelf.tiles).toEqual([]);
  });

  it('counts lines expired or expiring within three days', async () => {
    await adjust({ delta: 1, expiryDate: '2026-05-31' });
    await adjust({ delta: 1, expiryDate: '2026-06-04' });
    await adjust({ delta: 1, expiryDate: '2026-06-05' });
    await adjust({ delta: 1 });
    const fridge = (await get()).body.locations.find((l: { id: number }) => l.id === fridgeId);
    expect(fridge.counts).toEqual({ products: 1, units: 4, expiringSoon: 2 });
    const statuses = fridge.unshelved.map((t: { expiry: unknown }) => t.expiry);
    expect(statuses).toContainEqual({ status: 'expired' });
    expect(statuses).toContainEqual({ status: 'soon', days: 3 });
  });
});
