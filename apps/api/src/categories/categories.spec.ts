import type { INestApplication } from '@nestjs/common';
import { CATEGORY_ICONS } from '@inventaire/shared';
import { and, eq } from 'drizzle-orm';
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
  createHousehold,
  HOUSEHOLD,
} from '../../test/helpers';
import { categories, offCategoryMap, products } from '../database/schema';
import { CATEGORY_SEEDS } from '../database/seed/categories';

let app: INestApplication;
const CAT = `/api/admin/households/${HOUSEHOLD}/categories`;
const MAP = `/api/admin/households/${HOUSEHOLD}/off-category-map`;
let admin: string;
let member: string;
const server = () => app.getHttpServer();
const db = () => ownerDb();

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

const as = (cookie: string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  post: (url: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
  delete: (url: string) =>
    request(server()).delete(url).set('Cookie', cookie).set('Origin', ORIGIN),
});

async function categoryId(name: string, householdId = HOUSEHOLD): Promise<number> {
  const [row] = await db()
    .select()
    .from(categories)
    .where(and(eq(categories.name, name), eq(categories.householdId, householdId)));
  return row!.id;
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
  await createUser(app, { username: 'root', password: 'motdepasse1', role: 'admin' });
  await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
  admin = await login('root');
  member = await login('membre');
});

describe('seed icons', () => {
  it('are all part of the closed icon list', () => {
    const allowed: readonly string[] = CATEGORY_ICONS;
    for (const seed of CATEGORY_SEEDS) expect(allowed).toContain(seed.icon);
  });
});

describe('/api/categories and /api/admin/households/:id/categories', () => {
  it('lists the categories in order for a member, and refuses anonymous callers', async () => {
    expect((await request(server()).get('/api/categories')).status).toBe(401);
    const res = await as(member).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(15);
    expect(res.body[0]).toMatchObject({ name: 'Boissons', isFallback: false });
    expect(res.body.at(-1)).toMatchObject({ name: 'Autre', isFallback: true });
  });

  it('creates a category at the end, then renames it and changes its icon and order', async () => {
    const created = await as(admin).post(CAT).send({ name: ' Bébé ', icon: 'baby' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Bébé', icon: 'baby', isFallback: false });
    expect(created.body.sortOrder).toBe(15);

    const patched = await as(admin)
      .patch(`${CAT}/${created.body.id}`)
      .send({ name: 'Bébé et enfants', icon: 'pill', sortOrder: 0 });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ name: 'Bébé et enfants', icon: 'pill', sortOrder: 0 });
  });

  it('answers 409 for a duplicate name, ignoring case', async () => {
    const dup = await as(admin).post(CAT).send({ name: 'boissons', icon: 'wine' });
    expect(dup.status).toBe(409);
    const id = await categoryId('Viandes');
    const rename = await as(admin).patch(`${CAT}/${id}`).send({ name: 'BOISSONS' });
    expect(rename.status).toBe(409);
  });

  it('answers 400 for an invalid name, an icon outside the list, or an unknown field', async () => {
    const id = await categoryId('Viandes');
    for (const body of [
      { icon: 'wine' },
      { name: '', icon: 'wine' },
      { name: 'x'.repeat(41), icon: 'wine' },
      { name: 'Test', icon: 'not-a-lucide-icon' },
      { name: 'Test', icon: 'wine', isFallback: true },
    ]) {
      expect((await as(admin).post(CAT).send(body)).status).toBe(400);
    }
    expect((await as(admin).patch(`${CAT}/${id}`).send({})).status).toBe(400);
    expect((await as(admin).patch(`${CAT}/${id}`).send({ icon: 'zzz' })).status).toBe(400);
  });

  it('answers 404 to a member on every write, and for an unknown id', async () => {
    const id = await categoryId('Viandes');
    expect((await as(member).post(CAT).send({ name: 'X', icon: 'wine' })).status).toBe(404);
    expect((await as(member).patch(`${CAT}/${id}`).send({ name: 'X' })).status).toBe(404);
    expect((await as(member).delete(`${CAT}/${id}`)).status).toBe(404);
    expect((await as(admin).patch(`${CAT}/99999`).send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).delete(`${CAT}/99999`)).status).toBe(404);
  });

  it('answers 409 when deleting "Autre"', async () => {
    const autre = await categoryId('Autre');
    const res = await as(admin).delete(`${CAT}/${autre}`);
    expect(res.status).toBe(409);
    expect(await categoryId('Autre')).toBe(autre);
  });

  it('moves the products to "Autre" as guessed and deletes the mappings', async () => {
    const viandes = await categoryId('Viandes');
    const autre = await categoryId('Autre');
    const [p] = await db()
      .insert(products)
      .values({ name: 'Jambon', categoryId: viandes, searchText: 'jambon', categoryGuessed: false })
      .returning({ id: products.id });
    const mappingsBefore = await db()
      .select()
      .from(offCategoryMap)
      .where(eq(offCategoryMap.categoryId, viandes));
    expect(mappingsBefore.length).toBeGreaterThan(0);

    expect((await as(admin).delete(`${CAT}/${viandes}`)).status).toBe(204);

    const [after] = await db().select().from(products).where(eq(products.id, p!.id));
    expect(after).toMatchObject({ categoryId: autre, categoryGuessed: true });
    expect(
      await db().select().from(offCategoryMap).where(eq(offCategoryMap.categoryId, viandes)),
    ).toHaveLength(0);
    expect(await db().select().from(categories).where(eq(categories.id, viandes))).toHaveLength(0);
  });
});

describe('/api/admin/households/:id/off-category-map', () => {
  it('is reserved to the admin (404 for a member)', async () => {
    expect((await as(member).get(MAP)).status).toBe(404);
    expect((await as(member).post(MAP).send({ offTag: 'en:x', categoryId: 1 })).status).toBe(404);
    expect((await as(member).patch(`${MAP}/1`).send({ offTag: 'en:y' })).status).toBe(404);
    expect((await as(member).delete(`${MAP}/1`)).status).toBe(404);
  });

  it('lists, creates, updates and deletes a mapping', async () => {
    const list = await as(admin).get(MAP);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(40);

    const boissons = await categoryId('Boissons');
    const viandes = await categoryId('Viandes');
    const created = await as(admin)
      .post(MAP)
      .send({ offTag: 'en:kombuchas', categoryId: boissons });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ offTag: 'en:kombuchas', categoryId: boissons });

    const patched = await as(admin)
      .patch(`${MAP}/${created.body.id}`)
      .send({ categoryId: viandes, offTag: 'fr:kombucha' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ offTag: 'fr:kombucha', categoryId: viandes });

    expect((await as(admin).delete(`${MAP}/${created.body.id}`)).status).toBe(204);
    expect((await as(admin).delete(`${MAP}/${created.body.id}`)).status).toBe(404);
  });

  it('answers 409 on a duplicate tag, on creation and on update', async () => {
    const boissons = await categoryId('Boissons');
    expect(
      (await as(admin).post(MAP).send({ offTag: 'en:waters', categoryId: boissons })).status,
    ).toBe(409);
    const created = await as(admin)
      .post(MAP)
      .send({ offTag: 'en:kombuchas', categoryId: boissons });
    const res = await as(admin).patch(`${MAP}/${created.body.id}`).send({ offTag: 'en:waters' });
    expect(res.status).toBe(409);
  });

  it('answers 400 for a malformed tag or body, 404 for an unknown id or category', async () => {
    const boissons = await categoryId('Boissons');
    for (const offTag of ['waters', 'en:', 'EN:Waters', 'en:a b', 'english:x', ':x']) {
      expect((await as(admin).post(MAP).send({ offTag, categoryId: boissons })).status).toBe(400);
    }
    expect((await as(admin).post(MAP).send({ offTag: 'en:ok' })).status).toBe(400);
    expect((await as(admin).patch(`${MAP}/1`).send({})).status).toBe(400);
    expect((await as(admin).post(MAP).send({ offTag: 'en:ok', categoryId: 99999 })).status).toBe(
      404,
    );
    expect((await as(admin).patch(`${MAP}/99999`).send({ offTag: 'en:ok' })).status).toBe(404);
  });
});

describe('categories of each household (D5)', () => {
  it('changes only the household named in the path, never another one', async () => {
    const other = await createHousehold(app, 'Voisins');
    const viandes = await categoryId('Viandes', other);
    const renamed = await as(admin)
      .patch(`/api/admin/households/${other}/categories/${viandes}`)
      .send({ name: 'Charcuterie' });
    expect(renamed.status).toBe(200);
    // The admin's own household (1) still has « Viandes », the member sees no change.
    const mine = await as(member).get('/api/categories');
    expect(mine.body.map((c: { name: string }) => c.name)).toContain('Viandes');
    expect(mine.body.map((c: { name: string }) => c.name)).not.toContain('Charcuterie');
    const theirs = await as(admin).get(`/api/admin/households/${other}/categories`);
    expect(theirs.body.map((c: { name: string }) => c.name)).toContain('Charcuterie');

    const created = await as(admin)
      .post(`/api/admin/households/${other}/off-category-map`)
      .send({ offTag: 'en:kombuchas', categoryId: viandes });
    expect(created.status).toBe(201);
    expect((await as(admin).get(MAP)).body.map((m: { offTag: string }) => m.offTag)).not.toContain(
      'en:kombuchas',
    );
  });

  it('refuses an id of another household through the path of the first one (404)', async () => {
    const other = await createHousehold(app, 'Voisins');
    const theirs = await categoryId('Viandes', other);
    expect((await as(admin).patch(`${CAT}/${theirs}`).send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).delete(`${CAT}/${theirs}`)).status).toBe(404);
    // A mapping of household 1 cannot point at a category of the other household.
    expect((await as(admin).post(MAP).send({ offTag: 'en:x', categoryId: theirs })).status).toBe(
      404,
    );
  });

  it('answers 404 for an unknown household', async () => {
    expect((await as(admin).get('/api/admin/households/99999/categories')).status).toBe(404);
    expect((await as(admin).get('/api/admin/households/99999/off-category-map')).status).toBe(404);
    expect(
      (
        await as(admin)
          .post('/api/admin/households/99999/categories')
          .send({ name: 'X', icon: 'wine' })
      ).status,
    ).toBe(404);
  });

  it('never returns the household of a mapping', async () => {
    const list = await as(admin).get(MAP);
    expect(Object.keys(list.body[0]).sort()).toEqual(['categoryId', 'id', 'offTag']);
  });
});
