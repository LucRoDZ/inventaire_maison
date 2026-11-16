import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, resetAuth } from '../../test/helpers';
import { DB, PG_POOL, type Database } from '../database/database.module';
import { categories, locations, products, shelves, stockItems } from '../database/schema';
import { SeedService } from '../database/seed/seed.service';
import { buildSearchText, normalizeSearch } from './search-text';

let app: INestApplication;
let cookie: string;
let memberId: number;
const server = () => app.getHttpServer();
const db = () => app.get<Database>(DB);

const api = {
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  post: (url: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
};

async function categoryId(name: string): Promise<number> {
  const [row] = await db().select().from(categories).where(eq(categories.name, name));
  return row!.id;
}

async function locationId(name: string): Promise<number> {
  const [row] = await db().select().from(locations).where(eq(locations.name, name));
  return row!.id;
}

async function addProduct(name: string, category: string, brand?: string): Promise<number> {
  const res = await api
    .post('/api/products')
    .send({ name, brand, categoryId: await categoryId(category) });
  expect(res.status).toBe(201);
  return res.body.id;
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
  memberId = await createUser(app, { username: 'membre', password: 'motdepasse1' });
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(res, 'inv_session')}`;
});

describe('search text', () => {
  it('lowercases and strips accents and ligatures', () => {
    expect(normalizeSearch('  Lait   Demi-Écrémé ')).toBe('lait demi-ecreme');
    expect(normalizeSearch('Œufs Bœuf Æther')).toBe('oeufs boeuf aether');
    expect(buildSearchText('Crème', 'Président')).toBe('creme president');
    expect(buildSearchText('Pain', null)).toBe('pain');
  });
});

describe('POST /api/products', () => {
  it('requires a session and the Origin header', async () => {
    expect(
      (await request(server()).post('/api/products').set('Origin', ORIGIN).send({})).status,
    ).toBe(401);
    expect(
      (await request(server()).post('/api/products').set('Cookie', cookie).send({})).status,
    ).toBe(403);
  });

  it('creates a product with only a name and a category (no barcode)', async () => {
    const res = await api
      .post('/api/products')
      .send({ name: '  Tomates ', categoryId: await categoryId('Fruits et légumes') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Tomates',
      barcode: null,
      brand: null,
      sizeLabel: null,
      imageUrl: null,
      defaultLocationId: null,
      source: 'manual',
      categoryGuessed: false,
      createdBy: memberId,
    });
    const [row] = await db().select().from(products).where(eq(products.id, res.body.id));
    expect(row!.searchText).toBe('tomates');
  });

  it('accepts two products without a barcode', async () => {
    await addProduct('Tomates', 'Fruits et légumes');
    await addProduct('Courgettes', 'Fruits et légumes');
    expect(await db().select().from(products)).toHaveLength(2);
  });

  it('stores every optional field and the normalized barcode', async () => {
    const frigo = await locationId('Frigo');
    const res = await api.post('/api/products').send({
      name: 'Pâte à tartiner',
      brand: 'Nutella',
      sizeLabel: '400 g',
      categoryId: await categoryId('Épicerie sucrée'),
      defaultLocationId: frigo,
      barcode: '3 017620 422003',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      barcode: '3017620422003',
      brand: 'Nutella',
      sizeLabel: '400 g',
      defaultLocationId: frigo,
    });
    const [row] = await db().select().from(products).where(eq(products.id, res.body.id));
    expect(row!.searchText).toBe('pate a tartiner nutella');
  });

  it('normalizes a UPC-A barcode', async () => {
    const res = await api
      .post('/api/products')
      .send({ name: 'Maïs', categoryId: await categoryId('Conserves'), barcode: '036000291452' });
    expect(res.status).toBe(201);
    expect(res.body.barcode).toBe('0036000291452');
  });

  it('answers 409 with the existing product id when the barcode is already there', async () => {
    const first = await api.post('/api/products').send({
      name: 'Nutella',
      categoryId: await categoryId('Épicerie sucrée'),
      barcode: '3017620422003',
    });
    const dup = await api
      .post('/api/products')
      .send({ name: 'Autre', categoryId: await categoryId('Autre'), barcode: '3017-6204-22003' });
    expect(dup.status).toBe(409);
    expect(dup.body.productId).toBe(first.body.id);
    expect(await db().select().from(products)).toHaveLength(1);
  });

  it('answers 409 for two simultaneous creations of the same barcode', async () => {
    const body = {
      name: 'Nutella',
      categoryId: await categoryId('Autre'),
      barcode: '3017620422003',
    };
    const results = await Promise.all([
      api.post('/api/products').send(body),
      api.post('/api/products').send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db().select().from(products)).toHaveLength(1);
  });

  it('answers 400 for an invalid barcode', async () => {
    const category = await categoryId('Autre');
    for (const barcode of ['3017620422004', 'abc', '12345']) {
      const res = await api
        .post('/api/products')
        .send({ name: 'X', categoryId: category, barcode });
      expect(res.status).toBe(400);
    }
    expect(await db().select().from(products)).toHaveLength(0);
  });

  it('answers 400 without a name or a category, or with an unknown field', async () => {
    const category = await categoryId('Autre');
    for (const body of [
      { categoryId: category },
      { name: 'X' },
      { name: '   ', categoryId: category },
      { name: 'x'.repeat(121), categoryId: category },
      { name: 'X', categoryId: category, source: 'off' },
      { name: 'X', categoryId: category, createdBy: 1 },
    ]) {
      expect((await api.post('/api/products').send(body)).status).toBe(400);
    }
  });

  it('answers 404 for an unknown category or default location', async () => {
    const category = await categoryId('Autre');
    expect((await api.post('/api/products').send({ name: 'X', categoryId: 99999 })).status).toBe(
      404,
    );
    expect(
      (
        await api
          .post('/api/products')
          .send({ name: 'X', categoryId: category, defaultLocationId: 99999 })
      ).status,
    ).toBe(404);
  });
});

describe('GET /api/products', () => {
  beforeEach(async () => {
    await addProduct('Lait demi-écrémé', 'Produits laitiers et œufs', 'Candia');
    await addProduct('Lait entier', 'Produits laitiers et œufs', 'Lactel');
    await addProduct('Beurre doux', 'Produits laitiers et œufs');
    await addProduct('Spaghetti', 'Pâtes, riz et féculents', 'Barilla');
  });

  const names = (res: request.Response) => res.body.map((p: { name: string }) => p.name);

  it('answers 401 without a session', async () => {
    expect((await request(server()).get('/api/products')).status).toBe(401);
  });

  it('finds "Lait demi-écrémé" from "lait ecreme" (no accents)', async () => {
    const res = await api.get('/api/products?q=lait+ecreme');
    expect(res.status).toBe(200);
    expect(names(res)).toContain('Lait demi-écrémé');
    expect(names(res)).not.toContain('Spaghetti');
  });

  it('finds a product despite a typo', async () => {
    expect(names(await api.get('/api/products?q=spagetti'))[0]).toBe('Spaghetti');
    expect(names(await api.get('/api/products?q=beure'))[0]).toBe('Beurre doux');
  });

  it('searches the brand too, and ignores case and accents in the query', async () => {
    expect(names(await api.get('/api/products?q=BARILLA'))).toEqual(['Spaghetti']);
    expect(names(await api.get('/api/products?q=LÀIT'))).toContain('Lait entier');
  });

  it('ranks an exact substring above a fuzzy match', async () => {
    const res = await api.get('/api/products?q=lait+entier');
    expect(names(res)[0]).toBe('Lait entier');
  });

  it('returns nothing for an unrelated query', async () => {
    expect(names(await api.get('/api/products?q=xylophone'))).toEqual([]);
  });

  it('lists by name without a query, and honours limit', async () => {
    expect(names(await api.get('/api/products'))).toEqual([
      'Beurre doux',
      'Lait demi-écrémé',
      'Lait entier',
      'Spaghetti',
    ]);
    expect(names(await api.get('/api/products?limit=2'))).toHaveLength(2);
  });

  it('caps the default at 20 results', async () => {
    for (let i = 0; i < 22; i++) await addProduct(`Yaourt ${String(i).padStart(2, '0')}`, 'Autre');
    expect((await api.get('/api/products')).body).toHaveLength(20);
    expect((await api.get('/api/products?limit=100')).body.length).toBe(26);
  });

  it('answers 400 for a bad limit', async () => {
    for (const query of ['limit=0', 'limit=101', 'limit=abc']) {
      expect((await api.get(`/api/products?${query}`)).status).toBe(400);
    }
  });
});

describe('GET /api/products/:id', () => {
  it('returns the product with its stock grouped by location', async () => {
    const id = await addProduct('Lait', 'Produits laitiers et œufs');
    const frigo = await locationId('Frigo');
    const pantry = await locationId('Garde-manger');
    const [shelf] = await db().select().from(shelves).where(eq(shelves.locationId, frigo)).limit(1);
    await db()
      .insert(stockItems)
      .values([
        {
          productId: id,
          locationId: frigo,
          shelfId: shelf!.id,
          quantity: 2,
          expiryDate: '2026-12-01',
        },
        { productId: id, locationId: frigo, shelfId: null, quantity: 1, expiryDate: null },
        { productId: id, locationId: pantry, shelfId: null, quantity: 4, expiryDate: null },
      ]);

    const res = await api.get(`/api/products/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lait');
    expect(res.body.stock).toHaveLength(2);
    const fridge = res.body.stock.find((s: { locationId: number }) => s.locationId === frigo);
    expect(fridge).toMatchObject({ locationName: 'Frigo', quantity: 3 });
    expect(fridge.lines).toHaveLength(2);
    expect(fridge.lines[0]).toMatchObject({
      shelfId: shelf!.id,
      shelfName: shelf!.name,
      quantity: 2,
    });
    expect(fridge.lines[1]).toMatchObject({ shelfId: null, shelfName: null, quantity: 1 });
  });

  it('returns an empty stock for a product that is not in stock', async () => {
    const id = await addProduct('Lait', 'Autre');
    expect((await api.get(`/api/products/${id}`)).body.stock).toEqual([]);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await api.get('/api/products/99999')).status).toBe(404);
    expect((await api.get('/api/products/abc')).status).toBe(404);
  });
});

describe('PATCH /api/products/:id', () => {
  it('edits name and brand and refreshes the search text', async () => {
    const id = await addProduct('Lait', 'Autre', 'Candia');
    const res = await api
      .patch(`/api/products/${id}`)
      .send({ name: 'Crème fraîche', brand: 'Président' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Crème fraîche', brand: 'Président' });
    const [row] = await db().select().from(products).where(eq(products.id, id));
    expect(row!.searchText).toBe('creme fraiche president');
    expect(names(await api.get('/api/products?q=president'))).toEqual(['Crème fraîche']);

    const cleared = await api.patch(`/api/products/${id}`).send({ brand: null });
    expect(cleared.body.brand).toBeNull();
    const [after] = await db().select().from(products).where(eq(products.id, id));
    expect(after!.searchText).toBe('creme fraiche');
  });

  it('confirms the category: guessed goes back to false', async () => {
    const id = await addProduct('Yaourt', 'Autre');
    await db().update(products).set({ categoryGuessed: true }).where(eq(products.id, id));
    const dairy = await categoryId('Produits laitiers et œufs');
    const res = await api.patch(`/api/products/${id}`).send({ categoryId: dairy });
    expect(res.body).toMatchObject({ categoryId: dairy, categoryGuessed: false });

    // Choosing the very same category is a confirmation too.
    await db().update(products).set({ categoryGuessed: true }).where(eq(products.id, id));
    const same = await api.patch(`/api/products/${id}`).send({ categoryId: dairy });
    expect(same.body.categoryGuessed).toBe(false);
  });

  it('keeps the guessed flag when the category is not touched', async () => {
    const id = await addProduct('Yaourt', 'Autre');
    await db().update(products).set({ categoryGuessed: true }).where(eq(products.id, id));
    const res = await api.patch(`/api/products/${id}`).send({ name: 'Yaourt nature' });
    expect(res.body.categoryGuessed).toBe(true);
  });

  it('sets and clears the default location', async () => {
    const id = await addProduct('Lait', 'Autre');
    const cave = await locationId('Cave');
    expect(
      (await api.patch(`/api/products/${id}`).send({ defaultLocationId: cave })).body
        .defaultLocationId,
    ).toBe(cave);
    expect(
      (await api.patch(`/api/products/${id}`).send({ defaultLocationId: null })).body
        .defaultLocationId,
    ).toBeNull();
  });

  it('does not allow changing the barcode, source or creator', async () => {
    const id = await addProduct('Lait', 'Autre');
    for (const body of [{ barcode: '3017620422003' }, { source: 'off' }, { createdBy: 1 }]) {
      expect((await api.patch(`/api/products/${id}`).send(body)).status).toBe(400);
    }
  });

  it('answers 400 for an empty body or name, 404 for unknown product, category or location', async () => {
    const id = await addProduct('Lait', 'Autre');
    expect((await api.patch(`/api/products/${id}`).send({})).status).toBe(400);
    expect((await api.patch(`/api/products/${id}`).send({ name: ' ' })).status).toBe(400);
    expect((await api.patch('/api/products/99999').send({ name: 'X' })).status).toBe(404);
    expect((await api.patch(`/api/products/${id}`).send({ categoryId: 99999 })).status).toBe(404);
    expect((await api.patch(`/api/products/${id}`).send({ defaultLocationId: 99999 })).status).toBe(
      404,
    );
  });
});

function names(res: request.Response): string[] {
  return res.body.map((p: { name: string }) => p.name);
}
