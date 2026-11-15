import type { INestApplication } from '@nestjs/common';
import { CATEGORY_ICONS } from '@inventaire/shared';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, resetAuth } from '../../test/helpers';
import { DB, PG_POOL, type Database } from '../database/database.module';
import { categories, offCategoryMap, products } from '../database/schema';
import { CATEGORY_SEEDS } from '../database/seed/categories';
import { SeedService } from '../database/seed/seed.service';

let app: INestApplication;
let admin: string;
let member: string;
const server = () => app.getHttpServer();
const db = () => app.get<Database>(DB);

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

async function categoryId(name: string): Promise<number> {
  const [row] = await db().select().from(categories).where(eq(categories.name, name));
  return row!.id;
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

describe('/api/categories', () => {
  it('lists the categories in order for a member, and refuses anonymous callers', async () => {
    expect((await request(server()).get('/api/categories')).status).toBe(401);
    const res = await as(member).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(15);
    expect(res.body[0]).toMatchObject({ name: 'Boissons', isFallback: false });
    expect(res.body.at(-1)).toMatchObject({ name: 'Autre', isFallback: true });
  });

  it('creates a category at the end, then renames it and changes its icon and order', async () => {
    const created = await as(admin).post('/api/categories').send({ name: ' Bébé ', icon: 'baby' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Bébé', icon: 'baby', isFallback: false });
    expect(created.body.sortOrder).toBe(15);

    const patched = await as(admin)
      .patch(`/api/categories/${created.body.id}`)
      .send({ name: 'Bébé et enfants', icon: 'pill', sortOrder: 0 });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ name: 'Bébé et enfants', icon: 'pill', sortOrder: 0 });
  });

  it('answers 409 for a duplicate name, ignoring case', async () => {
    const dup = await as(admin).post('/api/categories').send({ name: 'boissons', icon: 'wine' });
    expect(dup.status).toBe(409);
    const id = await categoryId('Viandes');
    const rename = await as(admin).patch(`/api/categories/${id}`).send({ name: 'BOISSONS' });
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
      expect((await as(admin).post('/api/categories').send(body)).status).toBe(400);
    }
    expect((await as(admin).patch(`/api/categories/${id}`).send({})).status).toBe(400);
    expect((await as(admin).patch(`/api/categories/${id}`).send({ icon: 'zzz' })).status).toBe(400);
  });

  it('answers 403 for a member on every write, 404 for an unknown id', async () => {
    const id = await categoryId('Viandes');
    expect(
      (await as(member).post('/api/categories').send({ name: 'X', icon: 'wine' })).status,
    ).toBe(403);
    expect((await as(member).patch(`/api/categories/${id}`).send({ name: 'X' })).status).toBe(403);
    expect((await as(member).delete(`/api/categories/${id}`)).status).toBe(403);
    expect((await as(admin).patch('/api/categories/99999').send({ name: 'X' })).status).toBe(404);
    expect((await as(admin).delete('/api/categories/99999')).status).toBe(404);
  });

  it('answers 409 when deleting "Autre"', async () => {
    const autre = await categoryId('Autre');
    const res = await as(admin).delete(`/api/categories/${autre}`);
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

    expect((await as(admin).delete(`/api/categories/${viandes}`)).status).toBe(204);

    const [after] = await db().select().from(products).where(eq(products.id, p!.id));
    expect(after).toMatchObject({ categoryId: autre, categoryGuessed: true });
    expect(
      await db().select().from(offCategoryMap).where(eq(offCategoryMap.categoryId, viandes)),
    ).toHaveLength(0);
    expect(await db().select().from(categories).where(eq(categories.id, viandes))).toHaveLength(0);
  });
});

describe('/api/off-category-map', () => {
  it('is reserved to the admin', async () => {
    expect((await as(member).get('/api/off-category-map')).status).toBe(403);
    expect(
      (await as(member).post('/api/off-category-map').send({ offTag: 'en:x', categoryId: 1 }))
        .status,
    ).toBe(403);
    expect(
      (await as(member).patch('/api/off-category-map/1').send({ offTag: 'en:y' })).status,
    ).toBe(403);
    expect((await as(member).delete('/api/off-category-map/1')).status).toBe(403);
  });

  it('lists, creates, updates and deletes a mapping', async () => {
    const list = await as(admin).get('/api/off-category-map');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(40);

    const boissons = await categoryId('Boissons');
    const viandes = await categoryId('Viandes');
    const created = await as(admin)
      .post('/api/off-category-map')
      .send({ offTag: 'en:kombuchas', categoryId: boissons });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ offTag: 'en:kombuchas', categoryId: boissons });

    const patched = await as(admin)
      .patch(`/api/off-category-map/${created.body.id}`)
      .send({ categoryId: viandes, offTag: 'fr:kombucha' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ offTag: 'fr:kombucha', categoryId: viandes });

    expect((await as(admin).delete(`/api/off-category-map/${created.body.id}`)).status).toBe(204);
    expect((await as(admin).delete(`/api/off-category-map/${created.body.id}`)).status).toBe(404);
  });

  it('answers 409 on a duplicate tag, on creation and on update', async () => {
    const boissons = await categoryId('Boissons');
    expect(
      (
        await as(admin)
          .post('/api/off-category-map')
          .send({ offTag: 'en:waters', categoryId: boissons })
      ).status,
    ).toBe(409);
    const created = await as(admin)
      .post('/api/off-category-map')
      .send({ offTag: 'en:kombuchas', categoryId: boissons });
    const res = await as(admin)
      .patch(`/api/off-category-map/${created.body.id}`)
      .send({ offTag: 'en:waters' });
    expect(res.status).toBe(409);
  });

  it('answers 400 for a malformed tag or body, 404 for an unknown id or category', async () => {
    const boissons = await categoryId('Boissons');
    for (const offTag of ['waters', 'en:', 'EN:Waters', 'en:a b', 'english:x', ':x']) {
      expect(
        (await as(admin).post('/api/off-category-map').send({ offTag, categoryId: boissons }))
          .status,
      ).toBe(400);
    }
    expect((await as(admin).post('/api/off-category-map').send({ offTag: 'en:ok' })).status).toBe(
      400,
    );
    expect((await as(admin).patch('/api/off-category-map/1').send({})).status).toBe(400);
    expect(
      (await as(admin).post('/api/off-category-map').send({ offTag: 'en:ok', categoryId: 99999 }))
        .status,
    ).toBe(404);
    expect(
      (await as(admin).patch('/api/off-category-map/99999').send({ offTag: 'en:ok' })).status,
    ).toBe(404);
  });
});
