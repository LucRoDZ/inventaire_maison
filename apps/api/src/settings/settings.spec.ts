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
  resetAll,
  seedHousehold,
} from '../../test/helpers';

let app: INestApplication;
let member: string;
let admin: string;
let other: number;
const server = () => app.getHttpServer();

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}
const as = (cookie: string) => ({
  get: (url: string) => request(server()).get(url).set('Cookie', cookie),
  patch: (url: string) => request(server()).patch(url).set('Cookie', cookie).set('Origin', ORIGIN),
});

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetAll();
  await seedHousehold(app);
  other = await createHousehold(app, 'Autre foyer');
  await createUser(app, { username: 'membre', password: 'motdepasse1' });
  await createUser(app, { username: 'chef', password: 'motdepasse1', role: 'admin' });
  member = await login('membre');
  admin = await login('chef');
});

describe('settings', () => {
  it('defaults to 3 days for a household without a row', async () => {
    expect((await request(server()).get('/api/settings')).status).toBe(401);
    expect((await as(member).get('/api/settings')).body).toEqual({ expiryAlertDays: 3 });
    expect((await as(admin).get(`/api/admin/households/${other}/settings`)).body).toEqual({
      expiryAlertDays: 3,
    });
  });

  it('is changed by the admin for the chosen household only', async () => {
    const res = await as(admin)
      .patch(`/api/admin/households/${HOUSEHOLD}/settings`)
      .send({ expiryAlertDays: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expiryAlertDays: 7 });
    expect((await as(member).get('/api/settings')).body).toEqual({ expiryAlertDays: 7 });
    expect((await as(admin).get(`/api/admin/households/${other}/settings`)).body).toEqual({
      expiryAlertDays: 3,
    });
    // A second change updates the same row.
    await as(admin)
      .patch(`/api/admin/households/${HOUSEHOLD}/settings`)
      .send({ expiryAlertDays: 0 });
    expect((await as(member).get('/api/settings')).body).toEqual({ expiryAlertDays: 0 });
  });

  it('rejects invalid values, unknown households and members', async () => {
    const path = `/api/admin/households/${HOUSEHOLD}/settings`;
    for (const body of [
      { expiryAlertDays: 31 },
      { expiryAlertDays: -1 },
      { expiryAlertDays: 1.5 },
      {},
      { x: 1 },
    ]) {
      expect((await as(admin).patch(path).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await as(admin).get('/api/admin/households/9999/settings')).status).toBe(404);
    expect((await as(member).get(path)).status).toBe(404);
    expect((await as(member).patch(path).send({ expiryAlertDays: 5 })).status).toBe(404);
  });

  it('edits the shelf life of a category from the admin console', async () => {
    const list = await as(member).get('/api/categories');
    const id = (list.body as { id: number; shelfLifeDays: number | null }[])[0]!.id;
    const path = `/api/admin/households/${HOUSEHOLD}/categories/${id}`;
    expect((await as(admin).patch(path).send({ shelfLifeDays: 12 })).body.shelfLifeDays).toBe(12);
    const after = await as(member).get('/api/categories');
    expect(after.body.find((c: { id: number }) => c.id === id).shelfLifeDays).toBe(12);
    expect(
      (await as(admin).patch(path).send({ shelfLifeDays: null })).body.shelfLifeDays,
    ).toBeNull();
    for (const value of [0, 3651, 1.5]) {
      expect((await as(admin).patch(path).send({ shelfLifeDays: value })).status).toBe(400);
    }
  });
});
