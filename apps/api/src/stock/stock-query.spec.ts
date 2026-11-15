import type { INestApplication } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, FakeClock, ORIGIN, resetAuth } from '../../test/helpers';
import { DB, PG_POOL, type Database } from '../database/database.module';
import { categories, locations, products, shelves, stockItems } from '../database/schema';
import { SeedService } from '../database/seed/seed.service';
import { expiryStatus, parisToday } from './stock.query';

let app: INestApplication;
let cookie: string;
const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z')); // 12:00 in Paris
const server = () => app.getHttpServer();
const db = () => app.get<Database>(DB);
const get = (url: string) => request(server()).get(url).set('Cookie', cookie);

const ids: Record<string, number> = {};
const names = (res: request.Response) =>
  (res.body.items as { product: { name: string } }[]).map((i) => i.product.name);

async function addProduct(name: string, brand: string | null, categoryName: string) {
  const [cat] = await db().select().from(categories).where(eq(categories.name, categoryName));
  const search = [name, brand ?? '']
    .join(' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const [row] = await db()
    .insert(products)
    .values({ name, brand, categoryId: cat!.id, searchText: search })
    .returning();
  return row!.id;
}

async function addLine(
  productId: number,
  locationId: number,
  quantity: number,
  expiryDate: string | null,
  shelfId: number | null = null,
) {
  await db().insert(stockItems).values({ productId, locationId, quantity, expiryDate, shelfId });
}

beforeAll(async () => {
  app = await createTestApp({ clock });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  clock.advance(0);
  await resetAuth(app);
  await app
    .get<Pool>(PG_POOL)
    .query(
      'TRUNCATE stock_movements, stock_items, products, off_category_map, categories, shelves, locations RESTART IDENTITY CASCADE',
    );
  await app.get(SeedService).seed();
  await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(res, 'inv_session')}`;

  const locs = await db().select().from(locations).orderBy(asc(locations.sortOrder));
  ids['fridge'] = locs.find((l) => l.kind === 'fridge')!.id;
  ids['pantry'] = locs.find((l) => l.kind === 'pantry')!.id;
  ids['cellar'] = locs.find((l) => l.kind === 'cellar')!.id;
  ids['fridgeShelf'] = (
    await db().select().from(shelves).where(eq(shelves.locationId, ids['fridge']!))
  )[0]!.id;

  ids['lait'] = await addProduct('Lait demi-écrémé', 'Lactel', 'Autre');
  ids['beurre'] = await addProduct('Beurre', 'Président', 'Autre');
  ids['pates'] = await addProduct('Pâtes', null, 'Autre');
});

describe('expiry helpers', () => {
  it('flags the J-3 bounds', () => {
    expect(expiryStatus(null)).toBeNull();
    expect(expiryStatus(-1)).toEqual({ status: 'expired' });
    expect(expiryStatus(0)).toEqual({ status: 'soon', days: 0 });
    expect(expiryStatus(3)).toEqual({ status: 'soon', days: 3 });
    expect(expiryStatus(4)).toBeNull();
  });

  it('computes the date in Paris, not in UTC', () => {
    expect(parisToday(new Date('2026-06-01T21:59:00Z'))).toBe('2026-06-01');
    expect(parisToday(new Date('2026-06-01T22:00:00Z'))).toBe('2026-06-02');
    expect(parisToday(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
  });
});

describe('GET /api/stock', () => {
  it('requires a session and rejects bad filters', async () => {
    expect((await request(server()).get('/api/stock')).status).toBe(401);
    expect((await get('/api/stock?sort=colour')).status).toBe(400);
    expect((await get('/api/stock?location=abc')).status).toBe(400);
  });

  it('returns lines with product, category, location, shelf and counters', async () => {
    await addLine(ids['lait']!, ids['fridge']!, 3, null, ids['fridgeShelf']!);
    const res = await get('/api/stock');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      quantity: 3,
      expiry: null,
      product: { name: 'Lait demi-écrémé', brand: 'Lactel' },
      category: { name: 'Autre' },
      location: { id: ids['fridge'] },
      shelf: { id: ids['fridgeShelf'] },
    });
    expect(res.body.counts).toHaveLength(4);
    expect(
      res.body.counts.find((c: { locationId: number }) => c.locationId === ids['fridge']),
    ).toEqual({
      locationId: ids['fridge'],
      products: 1,
      units: 3,
    });
  });

  it('filters by location, shelf, category and text', async () => {
    await addLine(ids['lait']!, ids['fridge']!, 1, null, ids['fridgeShelf']!);
    await addLine(ids['beurre']!, ids['fridge']!, 1, null);
    await addLine(ids['pates']!, ids['pantry']!, 1, null);
    const [other] = await db()
      .select()
      .from(categories)
      .where(eq(categories.isFallback, false))
      .limit(1);
    await db()
      .update(products)
      .set({ categoryId: other!.id })
      .where(eq(products.id, ids['pates']!));

    expect(names(await get(`/api/stock?location=${ids['fridge']}`)).sort()).toEqual([
      'Beurre',
      'Lait demi-écrémé',
    ]);
    expect(names(await get(`/api/stock?shelf=${ids['fridgeShelf']}`))).toEqual([
      'Lait demi-écrémé',
    ]);
    expect(names(await get(`/api/stock?category=${other!.id}`))).toEqual(['Pâtes']);
    expect(names(await get('/api/stock?q=lait'))).toEqual(['Lait demi-écrémé']);
    expect(names(await get('/api/stock?q=PRESIDENT'))).toEqual(['Beurre']);
    expect(names(await get('/api/stock?q=ecreme'))).toEqual(['Lait demi-écrémé']);
    expect(names(await get('/api/stock?q=zzz'))).toEqual([]);
  });

  it('counts per location ignore the location and shelf filters but follow the others', async () => {
    await addLine(ids['lait']!, ids['fridge']!, 2, null);
    await addLine(ids['beurre']!, ids['pantry']!, 5, null);
    const res = await get(`/api/stock?location=${ids['fridge']}&q=beurre`);
    expect(res.body.items).toHaveLength(0);
    const pantry = res.body.counts.find(
      (c: { locationId: number }) => c.locationId === ids['pantry'],
    );
    expect(pantry).toMatchObject({ products: 1, units: 5 });
    const fridge = res.body.counts.find(
      (c: { locationId: number }) => c.locationId === ids['fridge'],
    );
    expect(fridge).toMatchObject({ products: 0, units: 0 });
  });

  it('sorts by name, by date added (newest first) and by expiry (no date last)', async () => {
    await addLine(ids['lait']!, ids['fridge']!, 1, '2026-06-10');
    await addLine(ids['beurre']!, ids['fridge']!, 1, null);
    await addLine(ids['pates']!, ids['pantry']!, 1, '2026-06-05');
    expect(names(await get('/api/stock?sort=name'))).toEqual([
      'Beurre',
      'Lait demi-écrémé',
      'Pâtes',
    ]);
    expect(names(await get('/api/stock?sort=added'))).toEqual([
      'Pâtes',
      'Beurre',
      'Lait demi-écrémé',
    ]);
    expect(names(await get('/api/stock?sort=expiry'))).toEqual([
      'Pâtes',
      'Lait demi-écrémé',
      'Beurre',
    ]);
    expect(names(await get(`/api/stock?location=${ids['fridge']}&sort=expiry`))).toEqual([
      'Lait demi-écrémé',
      'Beurre',
    ]);
  });

  it('computes the expiry status at the day bounds (today is 2026-06-01 in Paris)', async () => {
    const cases: [string, unknown][] = [
      ['2026-05-31', { status: 'expired' }],
      ['2026-06-01', { status: 'soon', days: 0 }],
      ['2026-06-04', { status: 'soon', days: 3 }],
      ['2026-06-05', null],
    ];
    for (const [date] of cases) await addLine(ids['lait']!, ids['fridge']!, 1, date);
    const res = await get('/api/stock?sort=expiry');
    const byDate = Object.fromEntries(
      res.body.items.map((i: { expiryDate: string; expiry: unknown }) => [i.expiryDate, i.expiry]),
    );
    for (const [date, expected] of cases) expect(byDate[date], date).toEqual(expected);
  });

  it('uses the Paris date just after midnight local time', async () => {
    await addLine(ids['lait']!, ids['fridge']!, 1, '2026-06-01');
    clock.advance(12.5 * 60 * 60 * 1000); // 22:30 UTC = 00:30 on June 2 in Paris
    const res = await get('/api/stock');
    expect(res.body.items[0].expiry).toEqual({ status: 'expired' });
  });
});
