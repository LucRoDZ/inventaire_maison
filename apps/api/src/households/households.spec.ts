import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createHousehold,
  createUser,
  HOUSEHOLD,
  ORIGIN,
  ownerPool,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { householdImageDir } from '../database/legacy-images';

let app: INestApplication;
let admin: string;
let member: string;
let adminId: number;
let memberId: number;
const server = () => app.getHttpServer();
const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await ownerPool().query<T>(text, params)).rows;

async function loginAttempt(username: string, password = 'motdepasse1') {
  return request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password });
}

async function login(username: string, password = 'motdepasse1'): Promise<string> {
  const res = await loginAttempt(username, password);
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

const countIn = async (table: string, householdId: number) =>
  (
    await q<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE household_id = $1`, [
      householdId,
    ])
  )[0]!.n;

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
  memberId = await createUser(app, { username: 'membre', password: 'motdepasse1' });
  admin = await login('root');
  member = await login('membre');
});

describe('households (admin console)', () => {
  it('lists the households with their accounts and their number of pieces of furniture only', async () => {
    const other = await createHousehold(app, 'Dupont');
    const res = await as(admin).get('/api/admin/households');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: other,
        name: 'Dupont',
        members: [],
        locationCount: 4,
        isOwn: false,
      }),
      expect.objectContaining({
        id: HOUSEHOLD,
        name: 'Famille',
        locationCount: 4,
        isOwn: true,
        members: [
          { id: memberId, username: 'membre', role: 'member', disabled: false },
          { id: adminId, username: 'root', role: 'admin', disabled: false },
        ],
      }),
    ]);
    // A count, never the content of an inventory.
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'createdAt',
      'id',
      'isOwn',
      'locationCount',
      'members',
      'name',
    ]);
  });

  it('creates a household with a copy of the model, in one transaction', async () => {
    const res = await as(admin).post('/api/admin/households').send({ name: '  Foyer Dupont ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), name: 'Foyer Dupont' });
    const id = res.body.id as number;
    expect(await countIn('categories', id)).toBe(15);
    expect(await countIn('locations', id)).toBe(4);
    expect(await countIn('shelves', id)).toBe(15);
    expect(await countIn('off_category_map', id)).toBeGreaterThan(70);
    expect(await countIn('products', id)).toBe(0);
  });

  it('refuses a name already used whatever its case, an empty or too long name', async () => {
    expect((await as(admin).post('/api/admin/households').send({ name: 'FAMILLE' })).status).toBe(
      409,
    );
    for (const name of ['', '   ', 'x'.repeat(41)]) {
      expect((await as(admin).post('/api/admin/households').send({ name })).status).toBe(400);
    }
    const before = await q('SELECT count(*)::int AS n FROM households');
    expect(before).toEqual([{ n: 1 }]);
  });

  it('renames a household, refusing a duplicate name and an unknown one', async () => {
    const other = await createHousehold(app, 'Dupont');
    const res = await as(admin).patch(`/api/admin/households/${other}`).send({ name: 'Durand' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: other, name: 'Durand' });
    expect(
      (await as(admin).patch(`/api/admin/households/${other}`).send({ name: 'famille' })).status,
    ).toBe(409);
    expect((await as(admin).patch('/api/admin/households/9999').send({ name: 'X' })).status).toBe(
      404,
    );
  });

  it('refuses to delete a household that still has accounts', async () => {
    const res = await as(admin)
      .delete(`/api/admin/households/${HOUSEHOLD}`)
      .send({ confirmName: 'Famille' });
    expect(res.status).toBe(409);
    expect(await countIn('locations', HOUSEHOLD)).toBe(4);
  });

  it('deletes an empty household and all its data only when its name is typed again', async () => {
    const other = await createHousehold(app, 'Dupont');
    await q(
      `INSERT INTO products (household_id, name, category_id)
       SELECT $1, 'Lait', id FROM categories WHERE household_id = $1 LIMIT 1`,
      [other],
    );
    const dir = householdImageDir(process.env['IMAGES_DIR']!, other);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${'c'.repeat(32)}.webp`), 'x');

    for (const confirmName of ['dupont', 'Dupon', '']) {
      const wrong = await as(admin).delete(`/api/admin/households/${other}`).send({ confirmName });
      expect(wrong.status, confirmName).toBe(400);
    }
    expect((await as(admin).delete(`/api/admin/households/${other}`).send({})).status).toBe(400);
    expect(await countIn('products', other)).toBe(1);

    const ok = await as(admin)
      .delete(`/api/admin/households/${other}`)
      .send({ confirmName: 'Dupont' });
    expect(ok.status).toBe(204);
    for (const table of ['locations', 'shelves', 'categories', 'off_category_map', 'products']) {
      expect(await countIn(table, other), table).toBe(0);
    }
    await expect(stat(dir)).rejects.toThrow();
    expect(
      (await as(admin).delete(`/api/admin/households/${other}`).send({ confirmName: 'Dupont' }))
        .status,
    ).toBe(404);
    // The other households are untouched.
    expect(await countIn('locations', HOUSEHOLD)).toBe(4);
  });
});

describe('accounts and households (admin console)', () => {
  it('creates an account in an existing household', async () => {
    const other = await createHousehold(app, 'Dupont');
    const res = await as(admin)
      .post('/api/users')
      .send({ username: 'marie', password: 'temporaire1', householdId: other });
    expect(res.status).toBe(201);
    expect(res.body.household).toEqual({ id: other, name: 'Dupont' });
    expect(
      (
        await as(admin)
          .post('/api/users')
          .send({ username: 'paul', password: 'temporaire1', householdId: 9999 })
      ).status,
    ).toBe(404);
  });

  it('creates an account in a new household, with a copy of the model, in one transaction', async () => {
    const res = await as(admin)
      .post('/api/users')
      .send({ username: 'durand', password: 'temporaire1', newHouseholdName: 'Foyer Durand' });
    expect(res.status).toBe(201);
    const id = res.body.household.id as number;
    expect(res.body.household.name).toBe('Foyer Durand');
    expect(await countIn('locations', id)).toBe(4);
    expect(await countIn('categories', id)).toBe(15);
  });

  it('creates nothing when the account cannot be created (pseudo taken, name taken)', async () => {
    const taken = await as(admin)
      .post('/api/users')
      .send({ username: 'MEMBRE', password: 'temporaire1', newHouseholdName: 'Foyer Fantôme' });
    expect(taken.status).toBe(409);
    expect(await q(`SELECT 1 FROM households WHERE name = 'Foyer Fantôme'`)).toEqual([]);
    const sameName = await as(admin)
      .post('/api/users')
      .send({ username: 'nouveau', password: 'temporaire1', newHouseholdName: 'famille' });
    expect(sameName.status).toBe(409);
    expect(await q(`SELECT 1 FROM users WHERE username = 'nouveau'`)).toEqual([]);
  });

  it('moves an account to another household: its sessions are cut and it then sees that inventory', async () => {
    const other = await createHousehold(app, 'Dupont');
    const homeBefore = await as(member).get('/api/home');
    const res = await as(admin).patch(`/api/users/${memberId}`).send({ householdId: other });
    expect(res.status).toBe(200);
    expect(res.body.household).toEqual({ id: other, name: 'Dupont' });
    expect((await as(member).get('/api/auth/me')).status).toBe(401);
    const again = await login('membre');
    const homeAfter = await as(again).get('/api/home');
    const ids = (body: { locations: { id: number }[] }) => body.locations.map((l) => l.id);
    expect(ids(homeAfter.body)).not.toEqual(ids(homeBefore.body));
    expect(await q('SELECT household_id FROM users WHERE id = $1', [memberId])).toEqual([
      { household_id: other },
    ]);
  });

  it('keeps the pseudo in the journal of the former household after a move', async () => {
    const other = await createHousehold(app, 'Dupont');
    const [product] = await q<{ id: number }>(
      `INSERT INTO products (household_id, name, category_id)
       SELECT $1, 'Lait', id FROM categories WHERE household_id = $1 LIMIT 1 RETURNING id`,
      [HOUSEHOLD],
    );
    const [fridge] = await q<{ id: number }>(
      `SELECT id FROM locations WHERE household_id = $1 AND kind = 'fridge'`,
      [HOUSEHOLD],
    );
    await as(member)
      .post('/api/stock/adjust')
      .send({ productId: product!.id, locationId: fridge!.id, delta: 1, reason: 'manual' });
    await as(admin).patch(`/api/users/${memberId}`).send({ householdId: other });
    const history = await as(admin).get(`/api/products/${product!.id}/movements`);
    expect(history.body.items[0].user.username).toBe('membre');
  });

  it('refuses to move oneself, and an unknown household', async () => {
    const other = await createHousehold(app, 'Dupont');
    expect(
      (await as(admin).patch(`/api/users/${adminId}`).send({ householdId: other })).status,
    ).toBe(409);
    expect(
      (await as(admin).patch(`/api/users/${memberId}`).send({ householdId: 9999 })).status,
    ).toBe(404);
  });

  it('protects the last admin: neither disabled, nor demoted, nor moved by itself', async () => {
    expect((await as(admin).delete(`/api/users/${adminId}`)).status).toBe(409);
    expect((await as(admin).patch(`/api/users/${adminId}`).send({ role: 'member' })).status).toBe(
      409,
    );
    const other = await createHousehold(app, 'Dupont');
    expect(
      (await as(admin).patch(`/api/users/${adminId}`).send({ householdId: other })).status,
    ).toBe(409);
    // Another admin may move it: it keeps its role, so the console stays reachable.
    await createUser(app, { username: 'second', password: 'motdepasse1', role: 'admin' });
    const second = await login('second');
    expect(
      (await as(second).patch(`/api/users/${adminId}`).send({ householdId: other })).status,
    ).toBe(200);
    const moved = await login('root');
    expect((await as(moved).get('/api/admin/households')).status).toBe(200);
  });

  it('lists every account with its household for the admin', async () => {
    const other = await createHousehold(app, 'Dupont');
    await createUser(app, { username: 'dupont', password: 'motdepasse1', householdId: other });
    const res = await as(admin).get('/api/users');
    expect(
      res.body.map((u: { username: string; household: { name: string } }) => [
        u.username,
        u.household.name,
      ]),
    ).toEqual([
      ['dupont', 'Dupont'],
      ['membre', 'Famille'],
      ['root', 'Famille'],
    ]);
  });
});

describe('first start and household:create', () => {
  it('creates « Famille » with a copy of the model and the first admin on an empty instance', async () => {
    await q('TRUNCATE sessions, login_attempts, users, households RESTART IDENTITY CASCADE');
    const { BootstrapAdminService } = await import('../users/bootstrap-admin.service');
    expect(await app.get(BootstrapAdminService).bootstrap()).toBe(true);
    const households = await q<{ id: number; name: string }>('SELECT id, name FROM households');
    expect(households).toEqual([{ id: expect.any(Number), name: 'Famille' }]);
    expect(await countIn('locations', households[0]!.id)).toBe(4);
    expect(await countIn('categories', households[0]!.id)).toBe(15);
    expect(
      (await loginAttempt(process.env['ADMIN_USERNAME']!, process.env['ADMIN_PASSWORD']!)).status,
    ).toBe(200);
  });

  it('household:create makes a household and its admin in one transaction', async () => {
    const { HouseholdsService } = await import('./households.service');
    const { PasswordService } = await import('../auth/password.service');
    const hash = await app.get(PasswordService).hash('genere-une-fois');
    const created = await app
      .get(HouseholdsService)
      .createWithAdmin('Maison de campagne', 'campagne', hash);
    expect(await countIn('locations', created.id)).toBe(4);
    const signedIn = await login('campagne', 'genere-une-fois');
    expect((await as(signedIn).get('/api/admin/households')).status).toBe(200);
    // A pseudo already taken: neither the household nor the account is created.
    await expect(
      app.get(HouseholdsService).createWithAdmin('Maison bis', 'campagne', hash),
    ).rejects.toThrow(/pseudo/);
    expect(await q(`SELECT 1 FROM households WHERE name = 'Maison bis'`)).toEqual([]);
  });
});

describe('the admin never reads the inventory of another household', () => {
  it('sees only its own household in every inventory route', async () => {
    const other = await createHousehold(app, 'Dupont');
    const [theirs] = await q<{ id: number }>(
      `INSERT INTO products (household_id, name, category_id)
       SELECT $1, 'Secret Dupont', id FROM categories WHERE household_id = $1 LIMIT 1 RETURNING id`,
      [other],
    );
    expect((await as(admin).get(`/api/products/${theirs!.id}`)).status).toBe(404);
    const search = await as(admin).get('/api/products?q=secret');
    expect(search.body).toEqual([]);
    const home = await as(admin).get('/api/home');
    expect(JSON.stringify(home.body)).not.toContain('Secret');
    const console = await as(admin).get('/api/admin/households');
    expect(JSON.stringify(console.body)).not.toContain('Secret');
  });
});
