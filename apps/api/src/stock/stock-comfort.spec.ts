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
import { categories, locations, products, settings, stockItems } from '../database/schema';

// 12:00 in Paris on 2026-06-01.
const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z'));
let app: INestApplication;
let cookie: string;
let fridge: number;
let productId: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();
const get = (url: string) => request(server()).get(url).set('Cookie', cookie);
const post = (url: string) =>
  request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN);

async function line(expiryDate: string | null, quantity = 1, name = 'Lait') {
  const [cat] = await db().select().from(categories).where(eq(categories.name, 'Autre'));
  const [product] = await db()
    .insert(products)
    .values({ name: `${name} ${expiryDate}`, categoryId: cat!.id, searchText: name.toLowerCase() })
    .returning();
  await db()
    .insert(stockItems)
    .values({ productId: product!.id, locationId: fridge, quantity, expiryDate });
  return product!.id;
}

const namesOf = (res: request.Response) =>
  (res.body.items as { expiryDate: string | null }[]).map((i) => i.expiryDate).sort();

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
  const locs = await db().select().from(locations).orderBy(asc(locations.sortOrder));
  fridge = locs.find((l) => l.kind === 'fridge')!.id;
});

describe('expiry filter and summary, with the household threshold', () => {
  beforeEach(async () => {
    await line('2026-05-31'); // expired
    await line('2026-06-01'); // today
    await line('2026-06-02'); // soon (1)
    await line('2026-06-04'); // soon (3)
    await line('2026-06-05'); // far with the default threshold
    await line(null);
  });

  it('filters today, soon and expired (default threshold 3)', async () => {
    expect(namesOf(await get('/api/stock?expiry=expired'))).toEqual(['2026-05-31']);
    expect(namesOf(await get('/api/stock?expiry=today'))).toEqual(['2026-06-01']);
    expect(namesOf(await get('/api/stock?expiry=soon'))).toEqual(['2026-06-02', '2026-06-04']);
    expect((await get('/api/stock?expiry=never')).status).toBe(400);
  });

  it('counts the lines of the filter in the per-location counters', async () => {
    const res = await get('/api/stock?expiry=today');
    const counts = res.body.counts as { locationId: number; units: number }[];
    expect(counts.find((c) => c.locationId === fridge)!.units).toBe(1);
  });

  it('answers the four counters with the threshold', async () => {
    expect((await request(server()).get('/api/stock/summary')).status).toBe(401);
    const res = await get('/api/stock/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inStock: 6, today: 1, soon: 2, expired: 1, expiryAlertDays: 3 });
  });

  it('follows the threshold of the household everywhere', async () => {
    await db().insert(settings).values({ expiryAlertDays: 5 });
    expect(namesOf(await get('/api/stock?expiry=soon'))).toEqual([
      '2026-06-02',
      '2026-06-04',
      '2026-06-05',
    ]);
    expect((await get('/api/stock/summary')).body).toMatchObject({ soon: 3, expiryAlertDays: 5 });
    const list = await get('/api/stock');
    const far = (list.body.items as { expiryDate: string; expiry: unknown }[]).find(
      (i) => i.expiryDate === '2026-06-05',
    );
    expect(far!.expiry).toEqual({ status: 'soon', days: 4 });
    // The home counters use the same lines.
    const home = await get('/api/home');
    const counts = (
      home.body.locations as { id: number; counts: { expired: number; soon: number } }[]
    ).find((l) => l.id === fridge)!.counts;
    const summary = (await get('/api/stock/summary')).body as {
      expired: number;
      today: number;
      soon: number;
    };
    expect(counts.expired + counts.soon).toBe(5);
    expect(counts.expired).toBe(summary.expired);
    expect(counts.soon).toBe(summary.today + summary.soon);

    await db().update(settings).set({ expiryAlertDays: 0 });
    expect(namesOf(await get('/api/stock?expiry=soon'))).toEqual([]);
    expect((await get('/api/stock/summary')).body).toMatchObject({ today: 1, soon: 0 });
  });
});

describe('consumed and wasted reasons', () => {
  beforeEach(async () => {
    productId = await line('2026-06-10', 5);
  });

  it('adjusts with consumed or wasted, a positive delta being the undo netted out by statistics', async () => {
    const base = { productId, locationId: fridge, expiryDate: '2026-06-10' };
    const eaten = await post('/api/stock/adjust').send({ ...base, delta: -1, reason: 'consumed' });
    expect(eaten.status).toBe(200);
    expect(eaten.body.movement.reason).toBe('consumed');
    const thrown = await post('/api/stock/adjust').send({ ...base, delta: -2, reason: 'wasted' });
    expect(thrown.body.movement).toMatchObject({ reason: 'wasted', delta: -2 });
    // "Jeté" chosen after a "Consommé": the consumed unit is put back with its own reason.
    const undone = await post('/api/stock/adjust').send({ ...base, delta: 1, reason: 'consumed' });
    expect(undone.status).toBe(200);
    const stats = await get('/api/stats');
    expect(stats.body).toMatchObject({ consumed: 0, wasted: 2 });
    // The wasted removal undone too: nothing left in the top of wasted products.
    await post('/api/stock/adjust').send({ ...base, delta: 2, reason: 'wasted' });
    expect((await get('/api/stats')).body).toMatchObject({ wasted: 0, topWasted: [] });
    expect(
      (await post('/api/stock/adjust').send({ ...base, delta: 1, reason: 'scan_remove' })).status,
    ).toBe(400);
    const history = await get(`/api/products/${productId}/movements`);
    expect(history.body.items.map((i: { reason: string }) => i.reason)).toEqual([
      'wasted',
      'consumed',
      'wasted',
      'consumed',
    ]);
  });

  it('removes one unit as consumed by default, wasted on request', async () => {
    const eaten = await post('/api/stock/remove').send({ productId });
    expect(eaten.body.movement.reason).toBe('consumed');
    const thrown = await post('/api/stock/remove').send({ productId, reason: 'wasted' });
    expect(thrown.body.movement.reason).toBe('wasted');
    expect((await post('/api/stock/remove').send({ productId, reason: 'manual' })).status).toBe(
      400,
    );
  });
});
