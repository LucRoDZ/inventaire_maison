import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Pool } from 'pg';
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
} from '../database/schema';
import { SeedService } from '../database/seed/seed.service';

let app: INestApplication;
let admin: string;
let member: string;
let adminId: number;
const server = () => app.getHttpServer();
const db = () => app.get<Database>(DB);

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

async function locationByName(name: string) {
  const [row] = await db().select().from(locations).where(eq(locations.name, name));
  return row!;
}

async function shelfByName(locationId: number, name: string) {
  const [row] = await db()
    .select()
    .from(shelves)
    .where(and(eq(shelves.locationId, locationId), eq(shelves.name, name)));
  return row!;
}

async function makeProduct(name: string): Promise<number> {
  const [category] = await db().select().from(categories).limit(1);
  const [row] = await db()
    .insert(products)
    .values({ name, categoryId: category!.id, searchText: name.toLowerCase() })
    .returning({ id: products.id });
  return row!.id;
}

async function stock(
  productId: number,
  locationId: number,
  shelfId: number | null,
  qty: number,
  expiry: string | null = null,
) {
  await db()
    .insert(stockItems)
    .values({ productId, locationId, shelfId, quantity: qty, expiryDate: expiry });
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
      'TRUNCATE stock_movements, stock_items, products, shelves, locations RESTART IDENTITY CASCADE',
    );
  await app.get(SeedService).seed();
  adminId = await createUser(app, { username: 'root', password: 'motdepasse1', role: 'admin' });
  await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
  admin = await login('root');
  member = await login('membre');
});

describe('GET /api/locations', () => {
  it('answers 401 without a session', async () => {
    expect((await request(server()).get('/api/locations')).status).toBe(401);
  });

  it('lets a member read the 4 locations with their sorted shelves', async () => {
    const res = await as(member).get('/api/locations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    const orders = res.body.map((l: { sortOrder: number }) => l.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    const fridge = res.body.find((l: { name: string }) => l.name === 'Frigo');
    expect(fridge.shelves.length).toBeGreaterThan(0);
    const shelfOrders = fridge.shelves.map((s: { sortOrder: number }) => s.sortOrder);
    expect(shelfOrders).toEqual([...shelfOrders].sort((a, b) => a - b));
    expect(fridge.shelves[0]).toMatchObject({ locationId: fridge.id, kind: 'plain' });
  });
});

describe('PATCH /api/locations/:id', () => {
  it('lets the admin rename a location, change its icon and order', async () => {
    const frigo = await locationByName('Frigo');
    const res = await as(admin)
      .patch(`/api/locations/${frigo.id}`)
      .send({ name: '  Réfrigérateur ', icon: 'snowflake', sortOrder: 9 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Réfrigérateur', icon: 'snowflake', sortOrder: 9 });
    expect(res.body.shelves.length).toBeGreaterThan(0);
    const list = await as(member).get('/api/locations');
    expect(list.body.at(-1).name).toBe('Réfrigérateur');
  });

  it('answers 403 for a member, 404 for an unknown id, 400 for a bad body', async () => {
    const frigo = await locationByName('Frigo');
    expect((await as(member).patch(`/api/locations/${frigo.id}`).send({ name: 'X' })).status).toBe(
      403,
    );
    expect((await as(admin).patch('/api/locations/99999').send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).patch('/api/locations/abc').send({ name: 'X' })).status).toBe(404);
    for (const body of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(41) },
      { icon: 'Pas Valide' },
      { sortOrder: -1 },
      { kind: 'fridge' },
    ]) {
      expect((await as(admin).patch(`/api/locations/${frigo.id}`).send(body)).status).toBe(400);
    }
  });
});

describe('POST /api/shelves', () => {
  it('creates a shelf at the end of the location', async () => {
    const cave = await locationByName('Cave');
    const before = (await as(member).get('/api/locations')).body.find(
      (l: { id: number }) => l.id === cave.id,
    ).shelves.length;
    const res = await as(admin)
      .post('/api/shelves')
      .send({ locationId: cave.id, name: ' Bouteilles ', kind: 'rack' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ locationId: cave.id, name: 'Bouteilles', kind: 'rack' });
    const after = (await as(member).get('/api/locations')).body.find(
      (l: { id: number }) => l.id === cave.id,
    ).shelves;
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1).id).toBe(res.body.id);
  });

  it('refuses a member, an unknown location and invalid fields', async () => {
    const cave = await locationByName('Cave');
    const ok = { locationId: cave.id, name: 'Haut', kind: 'plain' };
    expect((await as(member).post('/api/shelves').send(ok)).status).toBe(403);
    expect(
      (
        await as(admin)
          .post('/api/shelves')
          .send({ ...ok, locationId: 99999 })
      ).status,
    ).toBe(404);
    for (const body of [
      { ...ok, name: '' },
      { ...ok, name: 'x'.repeat(41) },
      { ...ok, kind: 'tiroir' },
      { name: 'Haut', kind: 'plain' },
    ]) {
      expect((await as(admin).post('/api/shelves').send(body)).status).toBe(400);
    }
  });
});

describe('PATCH /api/shelves/:id', () => {
  it('renames, retypes and reorders a shelf', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 1');
    const res = await as(admin)
      .patch(`/api/shelves/${shelf.id}`)
      .send({ name: 'Haut', kind: 'rack', sortOrder: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: shelf.id, name: 'Haut', kind: 'rack', sortOrder: 20 });
  });

  it('moves an empty shelf to another location, but not one holding stock', async () => {
    const frigo = await locationByName('Frigo');
    const pantry = await locationByName('Garde-manger');
    const empty = await shelfByName(frigo.id, 'Étagère 1');
    const full = await shelfByName(frigo.id, 'Étagère 2');
    await stock(await makeProduct('Lait'), frigo.id, full.id, 1);

    const moved = await as(admin).patch(`/api/shelves/${empty.id}`).send({ locationId: pantry.id });
    expect(moved.status).toBe(200);
    expect(moved.body.locationId).toBe(pantry.id);
    const blocked = await as(admin)
      .patch(`/api/shelves/${full.id}`)
      .send({ locationId: pantry.id });
    expect(blocked.status).toBe(409);
    const unknown = await as(admin).patch(`/api/shelves/${full.id}`).send({ locationId: 9999 });
    expect(unknown.status).toBe(404);
  });

  it('answers 403, 404 and 400 where due', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 1');
    expect((await as(member).patch(`/api/shelves/${shelf.id}`).send({ name: 'X' })).status).toBe(
      403,
    );
    expect((await as(admin).patch('/api/shelves/99999').send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).patch(`/api/shelves/${shelf.id}`).send({ name: '' })).status).toBe(400);
    expect((await as(admin).patch(`/api/shelves/${shelf.id}`).send({})).status).toBe(400);
  });
});

describe('DELETE /api/shelves/:id', () => {
  it('answers 403 for a member, 404 for an unknown shelf, 204 for the admin', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 3');
    expect((await as(member).delete(`/api/shelves/${shelf.id}`)).status).toBe(403);
    expect((await as(admin).delete('/api/shelves/99999')).status).toBe(404);
    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);
    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(404);
    expect(await db().select().from(shelves).where(eq(shelves.id, shelf.id))).toHaveLength(0);
  });

  it('sends the stock back to "Non rangé" with null shelf_id and two move movements', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    const lait = await makeProduct('Lait');
    await stock(lait, frigo.id, shelf.id, 3, '2026-12-01');

    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);

    const lines = await db().select().from(stockItems);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: lait,
      locationId: frigo.id,
      shelfId: null,
      quantity: 3,
      expiryDate: '2026-12-01',
    });
    const moves = await db().select().from(stockMovements).orderBy(asc(stockMovements.id));
    expect(moves.map((m) => [m.reason, m.delta, m.userId, m.expiryDate])).toEqual([
      ['move', -3, adminId, '2026-12-01'],
      ['move', 3, adminId, '2026-12-01'],
    ]);
  });

  it('merges with the identical line already in "Non rangé"', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    const lait = await makeProduct('Lait');
    const beurre = await makeProduct('Beurre');
    await stock(lait, frigo.id, null, 2, '2026-12-01');
    await stock(lait, frigo.id, shelf.id, 3, '2026-12-01');
    // Different date: stays a separate line. No date: merges with the no-date line.
    await stock(lait, frigo.id, shelf.id, 1, '2026-12-05');
    await stock(beurre, frigo.id, null, 4);
    await stock(beurre, frigo.id, shelf.id, 1);

    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);

    const lines = await db()
      .select()
      .from(stockItems)
      .where(isNull(stockItems.shelfId))
      .orderBy(asc(stockItems.productId), asc(stockItems.expiryDate));
    expect(lines.map((l) => [l.productId, l.quantity, l.expiryDate])).toEqual([
      [lait, 2 + 3, '2026-12-01'],
      [lait, 1, '2026-12-05'],
      [beurre, 4 + 1, null],
    ]);
    expect(await db().select().from(stockItems)).toHaveLength(3);
    expect(await db().select().from(stockMovements)).toHaveLength(6);
  });

  it('keeps older journal rows and detaches them from the deleted shelf', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    const lait = await makeProduct('Lait');
    await db().insert(stockMovements).values({
      productId: lait,
      locationId: frigo.id,
      shelfId: shelf.id,
      delta: 2,
      reason: 'scan_add',
      userId: adminId,
    });
    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);
    const moves = await db().select().from(stockMovements);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.shelfId).toBeNull();
  });

  it('rolls everything back when the transaction fails', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    await stock(await makeProduct('Lait'), frigo.id, shelf.id, 3);
    const pool = app.get<Pool>(PG_POOL);
    // A trigger makes the final DELETE fail after the stock was already moved.
    await pool.query(
      `CREATE FUNCTION fail_shelf_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql`,
    );
    await pool.query(
      'CREATE TRIGGER fail_shelf_delete BEFORE DELETE ON shelves FOR EACH ROW EXECUTE FUNCTION fail_shelf_delete()',
    );
    try {
      expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(500);
    } finally {
      await pool.query('DROP TRIGGER fail_shelf_delete ON shelves');
      await pool.query('DROP FUNCTION fail_shelf_delete()');
    }
    const [line] = await db().select().from(stockItems);
    expect(line!.shelfId).toBe(shelf.id);
    expect(await db().select().from(stockMovements)).toHaveLength(0);
  });
});
