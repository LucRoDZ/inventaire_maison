import type { INestApplication } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  DAY,
  FakeClock,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { categories, locations, products, stockMovements } from '../database/schema';

const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z'));
let app: INestApplication;
let cookie: string;
let userId: number;
let fridge: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();

async function product(name: string): Promise<number> {
  const [cat] = await db().select().from(categories).where(eq(categories.name, 'Autre'));
  const [row] = await db()
    .insert(products)
    .values({ name, categoryId: cat!.id, searchText: name.toLowerCase() })
    .returning();
  return row!.id;
}

async function move(productId: number, delta: number, reason: string, daysAgo: number) {
  await db()
    .insert(stockMovements)
    .values({
      productId,
      locationId: fridge,
      locationName: 'Frigo',
      delta,
      reason,
      userId,
      createdAt: new Date(clock.now().getTime() - daysAgo * DAY),
    });
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
  userId = await createUser(app, { username: 'membre', password: 'motdepasse1' });
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(res, 'inv_session')}`;
  fridge = (await db().select().from(locations).orderBy(asc(locations.sortOrder))).find(
    (l) => l.kind === 'fridge',
  )!.id;
});

describe('GET /api/stats', () => {
  it('requires a session and is empty without movements', async () => {
    expect((await request(server()).get('/api/stats')).status).toBe(401);
    const res = await request(server()).get('/api/stats').set('Cookie', cookie);
    expect(res.body).toEqual({ days: 30, consumed: 0, wasted: 0, wasteRate: null, topWasted: [] });
  });

  it('sums units over 30 days and ranks the five most wasted products', async () => {
    const [a, b, c, d, e, f] = await Promise.all(
      ['Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee', 'Fff'].map(product),
    );
    await move(a!, -3, 'consumed', 1);
    await move(a!, -1, 'consumed', 29);
    await move(a!, -50, 'consumed', 31); // too old
    await move(a!, +9, 'scan_add', 1); // not a removal
    await move(a!, -1, 'scan_remove', 1); // neither
    for (const [id, units] of [
      [a!, 1],
      [b!, 4],
      [c!, 3],
      [d!, 2],
      [e!, 5],
      [f!, 1],
    ] as const) {
      await move(id, -units, 'wasted', 2);
    }
    await move(b!, -40, 'wasted', 45); // too old
    const res = await request(server()).get('/api/stats').set('Cookie', cookie);
    expect(res.body).toMatchObject({ days: 30, consumed: 4, wasted: 16 });
    expect(res.body.wasteRate).toBeCloseTo(16 / 20);
    expect(res.body.topWasted).toEqual([
      { productId: e, name: 'Eee', units: 5 },
      { productId: b, name: 'Bbb', units: 4 },
      { productId: c, name: 'Ccc', units: 3 },
      { productId: d, name: 'Ddd', units: 2 },
      { productId: a, name: 'Aaa', units: 1 },
    ]);
  });
});
