import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  ORIGIN,
  ownerDb,
  ownerPool,
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
} from '../database/schema';

let app: INestApplication;
let admin: string;
let member: string;
let adminId: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();

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
  await resetAll();
  await seedHousehold(app);
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

  it('lets a member rename its furniture; 404 for an unknown id, 400 for a bad body', async () => {
    const frigo = await locationByName('Frigo');
    expect((await as(member).patch(`/api/locations/${frigo.id}`).send({ name: 'X' })).status).toBe(
      200,
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
      { householdId: 2 },
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

  it('lets a member add a shelf; refuses an unknown location and invalid fields', async () => {
    const cave = await locationByName('Cave');
    const ok = { locationId: cave.id, name: 'Haut', kind: 'plain' };
    expect((await as(member).post('/api/shelves').send(ok)).status).toBe(201);
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

  it('lets a member rename a shelf; 404 for an unknown id, 400 for a bad body', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 1');
    expect((await as(member).patch(`/api/shelves/${shelf.id}`).send({ name: 'X' })).status).toBe(
      200,
    );
    expect((await as(admin).patch('/api/shelves/99999').send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).patch(`/api/shelves/${shelf.id}`).send({ name: '' })).status).toBe(400);
    expect((await as(admin).patch(`/api/shelves/${shelf.id}`).send({})).status).toBe(400);
  });
});

describe('DELETE /api/shelves/:id', () => {
  it('lets a member delete a shelf; 404 for an unknown shelf', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 3');
    expect((await as(admin).delete('/api/shelves/99999')).status).toBe(404);
    expect((await as(member).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);
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

  it('never modifies older journal rows when a shelf is deleted', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    const lait = await makeProduct('Lait');
    await db().insert(stockMovements).values({
      productId: lait,
      locationId: frigo.id,
      locationName: frigo.name,
      shelfId: shelf.id,
      shelfName: shelf.name,
      delta: 2,
      reason: 'scan_add',
      userId: adminId,
    });
    expect((await as(admin).delete(`/api/shelves/${shelf.id}`)).status).toBe(204);
    const moves = await db().select().from(stockMovements);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.shelfId).toBe(shelf.id);
    expect(moves[0]!.delta).toBe(2);
  });

  it('rolls everything back when the transaction fails', async () => {
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 2');
    await stock(await makeProduct('Lait'), frigo.id, shelf.id, 3);
    const pool = ownerPool();
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

describe('POST /api/locations', () => {
  const create = (cookie: string, body: object) => as(cookie).post('/api/locations').send(body);
  const shelfNames = (body: { shelves: { name: string; kind: string }[] }) =>
    body.shelves.map((s) => `${s.name}/${s.kind}`);

  it('lets a member create a piece of furniture with the default shelves of its kind, last in order', async () => {
    const res = await create(member, { name: ' Frigo garage ', kind: 'fridge' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Frigo garage',
      kind: 'fridge',
      icon: 'refrigerator',
      sortOrder: 4,
      productCount: 0,
    });
    expect(shelfNames(res.body)).toEqual([
      'Étagère 1/plain',
      'Étagère 2/plain',
      'Étagère 3/plain',
      'Bac à légumes/plain',
    ]);
    const list = await as(member).get('/api/locations');
    expect(list.body.at(-1).name).toBe('Frigo garage');
  });

  it('names the shelves after the kind when a count is given', async () => {
    const freezer = await create(member, { name: 'Coffre', kind: 'freezer', shelfCount: 5 });
    expect(shelfNames(freezer.body)).toEqual([1, 2, 3, 4, 5].map((n) => `Tiroir ${n}/plain`));
    expect(freezer.body.icon).toBe('snowflake');
    const cellar = await create(member, { name: 'Cellier', kind: 'cellar', shelfCount: 2 });
    expect(shelfNames(cellar.body)).toEqual(['Rangée 1/rack', 'Rangée 2/rack']);
    const fridge = await create(member, { name: 'Frigo 3', kind: 'fridge', shelfCount: 1 });
    expect(shelfNames(fridge.body)).toEqual(['Étagère 1/plain']);
    const other = await create(member, { name: 'Buffet', kind: 'other' });
    expect(shelfNames(other.body)).toEqual([1, 2, 3, 4].map((n) => `Étagère ${n}/plain`));
    const defaults = await create(member, { name: 'Cave 2', kind: 'cellar' });
    expect(shelfNames(defaults.body)).toEqual([
      'Rangée 1/rack',
      'Rangée 2/rack',
      'Rangée 3/rack',
      'Caisses et packs/plain',
    ]);
  });

  it('keeps three fridges side by side', async () => {
    await create(member, { name: 'Frigo 2', kind: 'fridge' });
    await create(member, { name: 'Frigo garage', kind: 'fridge' });
    const list = await as(member).get('/api/locations');
    const fridges = list.body.filter((l: { kind: string }) => l.kind === 'fridge');
    expect(fridges.map((l: { name: string }) => l.name)).toEqual([
      'Frigo',
      'Frigo 2',
      'Frigo garage',
    ]);
    expect(new Set(fridges.map((l: { id: number }) => l.id)).size).toBe(3);
  });

  it('refuses a name already used whatever its case (409), and invalid fields (400)', async () => {
    expect((await create(member, { name: 'FRIGO', kind: 'fridge' })).status).toBe(409);
    for (const body of [
      { name: '', kind: 'fridge' },
      { name: 'x'.repeat(41), kind: 'fridge' },
      { name: 'Frigo 2', kind: 'buffet' },
      { name: 'Frigo 2' },
      { name: 'Frigo 2', kind: 'fridge', shelfCount: 0 },
      { name: 'Frigo 2', kind: 'fridge', shelfCount: 9 },
      { name: 'Frigo 2', kind: 'fridge', shelfCount: 2.5 },
      { name: 'Frigo 2', kind: 'fridge', householdId: 2 },
      { name: 'Frigo 2', kind: 'fridge', icon: 'wine' },
    ]) {
      expect((await create(member, body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('refuses a 13th piece of furniture (D6) and a 9th shelf', async () => {
    for (let n = 5; n <= 12; n++) {
      expect((await create(member, { name: `Meuble ${n}`, kind: 'other' })).status).toBe(201);
    }
    const res = await create(member, { name: 'Meuble 13', kind: 'other' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/12 meubles/);
    expect(JSON.stringify(res.body)).not.toMatch(/foyer|household/i);

    const huit = await create(admin, { name: 'Huit', kind: 'other', shelfCount: 8 });
    expect(huit.status).toBe(409);
    await as(admin).delete(`/api/locations/${(await locationByName('Meuble 12')).id}`);
    const eight = await create(admin, { name: 'Huit', kind: 'other', shelfCount: 8 });
    expect(eight.status).toBe(201);
    const ninth = await as(member)
      .post('/api/shelves')
      .send({ locationId: eight.body.id, name: 'Neuvième', kind: 'plain' });
    expect(ninth.status).toBe(409);
    // Moving an empty shelf into a full piece of furniture is refused too.
    const frigo = await locationByName('Frigo');
    const shelf = await shelfByName(frigo.id, 'Étagère 1');
    expect(
      (await as(member).patch(`/api/shelves/${shelf.id}`).send({ locationId: eight.body.id }))
        .status,
    ).toBe(409);
  });
});

describe('DELETE /api/locations/:id', () => {
  it('deletes an empty piece of furniture with its shelves; its products lose their default location', async () => {
    const created = await as(member).post('/api/locations').send({ name: 'Remise', kind: 'other' });
    const id = created.body.id as number;
    const lait = await makeProduct('Lait');
    await db().update(products).set({ defaultLocationId: id }).where(eq(products.id, lait));
    expect((await as(member).delete(`/api/locations/${id}`)).status).toBe(204);
    expect(await db().select().from(shelves).where(eq(shelves.locationId, id))).toHaveLength(0);
    const [product] = await db().select().from(products).where(eq(products.id, lait));
    expect(product!.defaultLocationId).toBeNull();
    expect((await as(member).delete(`/api/locations/${id}`)).status).toBe(404);
  });

  it('requires a destination when it holds stock, which must be another piece of furniture of the household', async () => {
    const frigo = await locationByName('Frigo');
    const cave = await locationByName('Cave');
    await stock(await makeProduct('Lait'), frigo.id, null, 2);
    const without = await as(member).delete(`/api/locations/${frigo.id}`);
    expect(without.status).toBe(409);
    expect(without.body.message).toMatch(/choisissez le meuble/i);
    expect(
      (await as(member).delete(`/api/locations/${frigo.id}?moveStockTo=${frigo.id}`)).status,
    ).toBe(400);
    expect((await as(member).delete(`/api/locations/${frigo.id}?moveStockTo=99999`)).status).toBe(
      404,
    );
    expect((await as(member).delete(`/api/locations/${frigo.id}?moveStockTo=abc`)).status).toBe(
      400,
    );
    expect((await as(member).delete(`/api/locations/${frigo.id}?autre=1`)).status).toBe(400);
    // Nothing moved, nothing deleted.
    expect(await db().select().from(stockItems)).toHaveLength(1);
    expect((await locationByName('Frigo')).id).toBe(frigo.id);
    expect(cave.id).toBeGreaterThan(0);
  });

  it('moves the stock into the « Non rangé » tray of the destination, adding up quantities, with two movements per line', async () => {
    const frigo = await locationByName('Frigo');
    const pantry = await locationByName('Garde-manger');
    const etagere2 = await shelfByName(frigo.id, 'Étagère 2');
    const lait = await makeProduct('Lait');
    const beurre = await makeProduct('Beurre');
    await stock(lait, frigo.id, etagere2.id, 3, '2026-12-01');
    await stock(lait, frigo.id, null, 1, '2026-12-01');
    await stock(beurre, frigo.id, etagere2.id, 2);
    // Already in the tray of the destination: quantities add up.
    await stock(lait, pantry.id, null, 4, '2026-12-01');

    const res = await as(member).delete(`/api/locations/${frigo.id}?moveStockTo=${pantry.id}`);
    expect(res.status).toBe(204);

    const lines = await db()
      .select()
      .from(stockItems)
      .orderBy(asc(stockItems.productId), asc(stockItems.expiryDate));
    expect(
      lines.map((l) => [l.productId, l.locationId, l.shelfId, l.quantity, l.expiryDate]),
    ).toEqual([
      [lait, pantry.id, null, 4 + 3 + 1, '2026-12-01'],
      [beurre, pantry.id, null, 2, null],
    ]);
    const moves = await db().select().from(stockMovements).orderBy(asc(stockMovements.id));
    expect(moves).toHaveLength(6);
    expect(moves.every((m) => m.reason === 'move')).toBe(true);
    expect(moves.reduce((sum, m) => sum + m.delta, 0)).toBe(0);
    expect(moves.filter((m) => m.delta < 0).every((m) => m.locationName === 'Frigo')).toBe(true);

    // The history stays readable: the deleted fridge keeps its name, the shelf too.
    const history = await as(member).get(`/api/products/${lait}/movements`);
    expect(history.status).toBe(200);
    const from = history.body.items.find(
      (i: { delta: number; shelf: { name: string } | null }) => i.delta === -3,
    );
    expect(from).toMatchObject({
      location: { id: frigo.id, name: 'Frigo' },
      shelf: { name: 'Étagère 2' },
    });
    expect(await db().select().from(shelves).where(eq(shelves.locationId, frigo.id))).toHaveLength(
      0,
    );
  });

  it('deletes the last piece of furniture of the household', async () => {
    for (const location of await db().select().from(locations)) {
      expect((await as(member).delete(`/api/locations/${location.id}`)).status).toBe(204);
    }
    expect((await as(member).get('/api/locations')).body).toEqual([]);
    const home = await as(member).get('/api/home');
    expect(home.body).toEqual({ locations: [] });
  });

  it('counts the distinct products of each piece of furniture', async () => {
    const frigo = await locationByName('Frigo');
    const lait = await makeProduct('Lait');
    await stock(lait, frigo.id, null, 2, '2026-12-01');
    await stock(lait, frigo.id, null, 1, '2026-12-02');
    await stock(await makeProduct('Beurre'), frigo.id, null, 1);
    const list = await as(member).get('/api/locations');
    expect(list.body.find((l: { id: number }) => l.id === frigo.id).productCount).toBe(2);
  });
});
