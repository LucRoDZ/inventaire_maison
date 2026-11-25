import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, ownerDb, resetAuth, HOUSEHOLD } from '../../test/helpers';
import { sessions, users } from '../database/schema';

let app: INestApplication;
let admin: string;
let member: string;
let adminId: number;
let memberId: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();

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

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAuth();
  adminId = await createUser(app, { username: 'root', password: 'motdepasse1', role: 'admin' });
  memberId = await createUser(app, { username: 'membre', password: 'motdepasse1' });
  admin = await login('root');
  member = await login('membre');
});

describe('access', () => {
  it('answers 401 without a session and 404 for a member, on every route', async () => {
    expect((await request(server()).post('/api/users').set('Origin', ORIGIN).send({})).status).toBe(
      401,
    );
    expect((await request(server()).get('/api/users')).status).toBe(401);
    expect((await as(member).get('/api/users')).status).toBe(404);
    expect(
      (
        await as(member)
          .post('/api/users')
          .send({ username: 'nouveau', password: 'motdepasse1', householdId: HOUSEHOLD })
      ).status,
    ).toBe(404);
    expect((await as(member).patch(`/api/users/${memberId}`).send({ role: 'admin' })).status).toBe(
      404,
    );
    expect((await as(member).delete(`/api/users/${adminId}`)).status).toBe(404);
  });
});

describe('GET /api/users', () => {
  it('lists the accounts without any hash', async () => {
    const res = await as(admin).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        username: 'membre',
        role: 'member',
        disabled: false,
        household: { id: HOUSEHOLD, name: 'Famille' },
      }),
      expect.objectContaining({ username: 'root', role: 'admin', disabled: false }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|hash/i);
  });
});

describe('POST /api/users', () => {
  it('creates a member who can sign in; the pseudo is stored in lowercase', async () => {
    const res = await as(admin)
      .post('/api/users')
      .send({ username: 'Marie', password: 'temporaire1', householdId: HOUSEHOLD });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'marie', role: 'member', disabled: false });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|hash/i);
    expect((await loginAttempt('MARIE', 'temporaire1')).status).toBe(200);
  });

  it('can create an admin', async () => {
    const res = await as(admin)
      .post('/api/users')
      .send({ username: 'second', password: 'temporaire1', role: 'admin', householdId: HOUSEHOLD });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('admin');
  });

  it('answers 409 for an existing pseudo whatever the case, even a disabled one', async () => {
    expect(
      (
        await as(admin)
          .post('/api/users')
          .send({ username: 'MEMBRE', password: 'temporaire1', householdId: HOUSEHOLD })
      ).status,
    ).toBe(409);
    await as(admin).delete(`/api/users/${memberId}`);
    expect(
      (
        await as(admin)
          .post('/api/users')
          .send({ username: 'membre', password: 'temporaire1', householdId: HOUSEHOLD })
      ).status,
    ).toBe(409);
  });

  it.each([
    ['short pseudo', { username: 'ab', password: 'temporaire1', householdId: HOUSEHOLD }],
    ['bad characters', { username: 'a b c', password: 'temporaire1', householdId: HOUSEHOLD }],
    ['short password', { username: 'nouveau', password: 'court', householdId: HOUSEHOLD }],
    ['long password', { username: 'nouveau', password: 'x'.repeat(129), householdId: HOUSEHOLD }],
    [
      'unknown role',
      { username: 'nouveau', password: 'temporaire1', role: 'root', householdId: HOUSEHOLD },
    ],
    [
      'extra field',
      { username: 'nouveau', password: 'temporaire1', passwordHash: 'x', householdId: HOUSEHOLD },
    ],
    ['no household', { username: 'nouveau', password: 'temporaire1' }],
    [
      'both an existing and a new household',
      {
        username: 'nouveau',
        password: 'temporaire1',
        householdId: HOUSEHOLD,
        newHouseholdName: 'Autre',
      },
    ],
    [
      'empty new household name',
      { username: 'nouveau', password: 'temporaire1', newHouseholdName: ' ' },
    ],
    ['no body', {}],
  ])('answers 400 for %s', async (_label, body) => {
    expect((await as(admin).post('/api/users').send(body)).status).toBe(400);
  });
});

describe('PATCH /api/users/{id}', () => {
  it('changes a role', async () => {
    const res = await as(admin).patch(`/api/users/${memberId}`).send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    // The new role applies at once to the open session.
    expect((await as(member).get('/api/users')).status).toBe(200);
  });

  it('sets a new password and revokes the sessions of the member', async () => {
    const res = await as(admin).patch(`/api/users/${memberId}`).send({ password: 'nouveau-mdp-1' });
    expect(res.status).toBe(200);
    expect((await as(member).get('/api/auth/me')).status).toBe(401);
    expect((await loginAttempt('membre')).status).toBe(401);
    expect((await loginAttempt('membre', 'nouveau-mdp-1')).status).toBe(200);
  });

  it('reactivates a disabled account', async () => {
    await as(admin).delete(`/api/users/${memberId}`);
    expect((await loginAttempt('membre')).status).toBe(401);
    const res = await as(admin).patch(`/api/users/${memberId}`).send({ disabled: false });
    expect(res.status).toBe(200);
    expect(res.body.disabled).toBe(false);
    expect((await loginAttempt('membre')).status).toBe(200);
  });

  it('protects the last active admin from demotion, and oneself', async () => {
    expect((await as(admin).patch(`/api/users/${adminId}`).send({ role: 'member' })).status).toBe(
      409,
    );
    expect(
      (await as(admin).patch(`/api/users/${adminId}`).send({ password: 'autre-mdp-12' })).status,
    ).toBe(409);
    // With a second admin, demoting the first one is allowed... for the second one to do.
    const secondId = await createUser(app, {
      username: 'second',
      password: 'motdepasse1',
      role: 'admin',
    });
    const second = await login('second');
    expect((await as(admin).patch(`/api/users/${adminId}`).send({ role: 'member' })).status).toBe(
      409,
    );
    expect((await as(second).patch(`/api/users/${adminId}`).send({ role: 'member' })).status).toBe(
      200,
    );
    // Now `second` is the last one.
    expect((await as(second).patch(`/api/users/${secondId}`).send({ role: 'member' })).status).toBe(
      409,
    );
  });

  it('does not count a disabled admin as an available one', async () => {
    const otherId = await createUser(app, {
      username: 'ancien',
      password: 'motdepasse1',
      role: 'admin',
      disabled: true,
    });
    const res = await as(admin).patch(`/api/users/${otherId}`).send({ role: 'member' });
    expect(res.status).toBe(200);
    const [row] = await db().select().from(users).where(eq(users.id, adminId));
    expect(row!.role).toBe('admin');
  });

  it('answers 404 for an unknown id and 400 for a bad body', async () => {
    expect((await as(admin).patch('/api/users/9999').send({ role: 'admin' })).status).toBe(404);
    expect((await as(admin).patch('/api/users/abc').send({ role: 'admin' })).status).toBe(404);
    expect((await as(admin).patch(`/api/users/${memberId}`).send({})).status).toBe(400);
    expect((await as(admin).patch(`/api/users/${memberId}`).send({ disabled: true })).status).toBe(
      400,
    );
    expect((await as(admin).patch(`/api/users/${memberId}`).send({ role: 'x' })).status).toBe(400);
    expect(
      (await as(admin).patch(`/api/users/${memberId}`).send({ password: 'court' })).status,
    ).toBe(400);
  });
});

describe('DELETE /api/users/{id}', () => {
  it('deactivates the account, cuts its sessions and refuses its login', async () => {
    const res = await as(admin).delete(`/api/users/${memberId}`);
    expect(res.status).toBe(204);
    expect(await db().select().from(sessions).where(eq(sessions.userId, memberId))).toHaveLength(0);
    expect((await as(member).get('/api/auth/me')).status).toBe(401);
    expect((await loginAttempt('membre')).status).toBe(401);
    const [row] = await db().select().from(users).where(eq(users.id, memberId));
    expect(row!.disabledAt).not.toBeNull();
  });

  it('is idempotent', async () => {
    expect((await as(admin).delete(`/api/users/${memberId}`)).status).toBe(204);
    expect((await as(admin).delete(`/api/users/${memberId}`)).status).toBe(204);
  });

  it('protects oneself and the last admin', async () => {
    expect((await as(admin).delete(`/api/users/${adminId}`)).status).toBe(409);
    const secondId = await createUser(app, {
      username: 'second',
      password: 'motdepasse1',
      role: 'admin',
    });
    const second = await login('second');
    // `root` is not alone any more, so `second` may deactivate it; then `second` is alone.
    expect((await as(second).delete(`/api/users/${adminId}`)).status).toBe(204);
    expect((await as(second).delete(`/api/users/${secondId}`)).status).toBe(409);
  });

  it('answers 404 for an unknown id', async () => {
    expect((await as(admin).delete('/api/users/9999')).status).toBe(404);
  });
});
