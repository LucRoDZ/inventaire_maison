import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  ORIGIN,
  ownerPool,
  resetAll,
  seedHousehold,
} from '../../test/helpers';

let app: INestApplication;
let cookie: string;
let fridge: number;
let pantry: number;
let productId: number;
const server = () => app.getHttpServer();
const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await ownerPool().query<T>(text, params)).rows;

const api = {
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  post: (url: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
};

const adjust = (delta: number, locationId = fridge) =>
  api.post('/api/stock/adjust').send({ productId, locationId, delta, reason: 'manual' });
const lines = async () =>
  (await q<{ id: number; origin: string; checked: boolean; quantity: number }>(
    'SELECT id, origin, checked, quantity FROM shopping_items WHERE product_id = $1 ORDER BY id',
    [productId],
  )) as { id: number; origin: string; checked: boolean; quantity: number }[];
const setMin = (minQuantity: number | null) =>
  api.patch(`/api/products/${productId}`).send({ minQuantity });

beforeAll(async () => {
  app = await createTestApp();
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
  fridge = (
    await q<{ id: number }>(`SELECT id FROM locations WHERE household_id = 1 AND kind = 'fridge'`)
  )[0]!.id;
  pantry = (
    await q<{ id: number }>(`SELECT id FROM locations WHERE household_id = 1 AND kind = 'pantry'`)
  )[0]!.id;
  const [cat] = await q<{ id: number }>('SELECT id FROM categories WHERE household_id = 1 LIMIT 1');
  const [p] = await q<{ id: number }>(
    `INSERT INTO products (household_id, name, category_id, search_text, default_location_id)
     VALUES (1, 'Lait', $1, 'lait', $2) RETURNING id`,
    [cat!.id, fridge],
  );
  productId = p!.id;
});

describe('automatic shopping line', () => {
  it('adds one auto line when the stock goes below the minimum, never twice', async () => {
    await adjust(3);
    await setMin(2);
    expect(await lines()).toEqual([]);
    await adjust(-2);
    expect(await lines()).toMatchObject([{ origin: 'auto', checked: false, quantity: 1 }]);
    await adjust(-1);
    expect(await lines()).toHaveLength(1);
    const list = await api.get('/api/shopping');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ origin: 'auto', product: { name: 'Lait' } });
  });

  it('removes the auto line once the stock is back at the minimum', async () => {
    await adjust(1);
    await setMin(2);
    expect(await lines()).toHaveLength(1);
    await adjust(1);
    expect(await lines()).toEqual([]);
  });

  it('reacts to the removal of one unit', async () => {
    await adjust(2);
    await setMin(2);
    expect(await lines()).toEqual([]);
    const res = await api.post('/api/stock/remove').send({ productId });
    expect(res.status).toBe(200);
    expect(await lines()).toMatchObject([{ origin: 'auto' }]);
  });

  it('uses the whole stock, all locations together, and ignores moves', async () => {
    await adjust(1, fridge);
    await adjust(1, pantry);
    await setMin(2);
    expect(await lines()).toEqual([]);
    const [line] = await q<{ id: number }>('SELECT id FROM stock_items WHERE location_id = $1', [
      pantry,
    ]);
    const moved = await api
      .post('/api/stock/move')
      .send({ stockItemId: line!.id, toLocationId: fridge, quantity: 1 });
    expect(moved.status).toBe(200);
    expect(await lines()).toEqual([]);
  });

  it('removes the auto line when the minimum is cleared or raised above the stock', async () => {
    await setMin(1);
    expect(await lines()).toMatchObject([{ origin: 'auto' }]);
    await setMin(null);
    expect(await lines()).toEqual([]);
    await adjust(5);
    await setMin(3);
    expect(await lines()).toEqual([]);
    await setMin(6);
    expect(await lines()).toHaveLength(1);
  });

  it('counts a manual open line as present and never touches it', async () => {
    const manual = await api.post('/api/shopping').send({ productId, quantity: 4 });
    await setMin(2);
    expect(await lines()).toMatchObject([{ id: manual.body.id, origin: 'manual', quantity: 4 }]);
    await adjust(5);
    expect(await lines()).toMatchObject([{ id: manual.body.id, origin: 'manual' }]);
  });

  it('never reopens nor duplicates a checked line', async () => {
    await setMin(2);
    const [auto] = await lines();
    await api.patch(`/api/shopping/${auto!.id}`).send({ checked: true });
    await adjust(1);
    expect(await lines()).toMatchObject([{ id: auto!.id, checked: true }]);
  });

  it('gives the auto line back when a checked line is cleared without being stored', async () => {
    await setMin(2);
    const [auto] = await lines();
    await api.patch(`/api/shopping/${auto!.id}`).send({ checked: true });
    await api.post('/api/shopping/clear-checked').send({});
    expect(await lines()).toMatchObject([{ origin: 'auto', checked: false }]);
  });

  it('stores the checked lines then evaluates the minimum again', async () => {
    await setMin(3);
    const [auto] = await lines();
    await api.patch(`/api/shopping/${auto!.id}`).send({ checked: true });
    await api.post('/api/shopping').send({ productId, quantity: 1 });
    const res = await api.post('/api/shopping/store-checked');
    expect(res.body.stored).toHaveLength(1);
    // Stock is 1, below 3: the open line added by hand is still the only one.
    expect(await lines()).toMatchObject([{ origin: 'manual', checked: false }]);
  });
});
