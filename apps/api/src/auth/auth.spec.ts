import type { INestApplication } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieValue,
  createUser,
  DAY,
  FakeClock,
  HOUR,
  resetAuth,
  setCookieLine,
} from '../../test/helpers';
import { createTestApp } from '../../test/create-test-app';
import { DB, type Database } from '../database/database.module';
import { sessions, users } from '../database/schema';
import { BootstrapAdminService } from '../users/bootstrap-admin.service';
import { SESSION_TTL_MS } from './auth.constants';

let app: INestApplication;
let clock: FakeClock;
let db: Database;

const server = () => app.getHttpServer();
const login = (username: string, password: string) =>
  request(server()).post('/api/auth/login').send({ username, password });

async function loginCookie(username: string, password: string): Promise<string> {
  const res = await login(username, password);
  expect(res.status).toBe(200);
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

beforeAll(async () => {
  clock = new FakeClock();
  app = await createTestApp({ clock });
  db = app.get<Database>(DB);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAuth(app);
  await createUser(app, { username: 'lucas', password: 'motdepasse1', role: 'admin' });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right credentials and sets the session cookie', async () => {
    const res = await login('lucas', 'motdepasse1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(Number), username: 'lucas', role: 'admin' });
    expect(JSON.stringify(res.body)).not.toContain('hash');
    expect(setCookieLine(res, 'inv_session')).toBeDefined();
  });

  it('sets httpOnly, SameSite=Lax, path / and a 30-day lifetime', async () => {
    const res = await login('lucas', 'motdepasse1');
    const line = setCookieLine(res, 'inv_session')!;
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Lax');
    expect(line).toContain('Path=/');
    const expires = new Date(/Expires=([^;]+)/.exec(line)![1]!).getTime();
    expect(Math.abs(expires - (clock.now().getTime() + SESSION_TTL_MS))).toBeLessThan(2000);
  });

  it('stores the session in the database', async () => {
    await login('lucas', 'motdepasse1');
    const [row] = await db.select({ n: count() }).from(sessions);
    expect(row!.n).toBe(1);
  });

  it('answers 401 with the same message for a wrong password and an unknown username', async () => {
    const wrong = await login('lucas', 'mauvais');
    const unknown = await login('personne', 'motdepasse1');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe('Pseudo ou mot de passe incorrect');
    expect(unknown.body).toEqual(wrong.body);
    expect(setCookieLine(wrong, 'inv_session')).toBeUndefined();
  });

  it('compares the username without case', async () => {
    expect((await login('LUCAS', 'motdepasse1')).status).toBe(200);
    expect((await login('  Lucas ', 'motdepasse1')).status).toBe(200);
  });

  it('refuses a disabled account with the same 401', async () => {
    await createUser(app, { username: 'bob', password: 'motdepasse1', disabled: true });
    const res = await login('bob', 'motdepasse1');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Pseudo ou mot de passe incorrect');
  });

  it('answers 400 on an invalid body', async () => {
    expect((await request(server()).post('/api/auth/login').send({})).status).toBe(400);
    expect((await login('', 'x')).status).toBe(400);
    expect(
      (await request(server()).post('/api/auth/login').send({ username: 1, password: 2 })).status,
    ).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('answers 401 without a cookie', async () => {
    expect((await request(server()).get('/api/auth/me')).status).toBe(401);
  });

  it('answers 200 with the user when logged in', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(Number), username: 'lucas', role: 'admin' });
  });

  it('answers 401 for a forged cookie', async () => {
    const res = await request(server()).get('/api/auth/me').set('Cookie', 'inv_session=forged');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('deletes the session and clears the cookie', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    const res = await request(server()).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(setCookieLine(res, 'inv_session')).toMatch(/inv_session=;/);
    const [row] = await db.select({ n: count() }).from(sessions);
    expect(row!.n).toBe(0);
    expect((await request(server()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('session lifetime', () => {
  it('answers 401 and deletes the row once expired', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    clock.advance(SESSION_TTL_MS + HOUR);
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    const [row] = await db.select({ n: count() }).from(sessions);
    expect(row!.n).toBe(0);
  });

  it('extends the session and the cookie after more than 24 hours', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    clock.advance(DAY + HOUR);
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(setCookieLine(res, 'inv_session')).toContain('Expires=');
    const [row] = await db.select().from(sessions);
    expect(row!.expiresAt.getTime()).toBe(clock.now().getTime() + SESSION_TTL_MS);
  });

  it('does not renew the cookie within 24 hours', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    clock.advance(2 * HOUR);
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(setCookieLine(res, 'inv_session')).toBeUndefined();
  });

  it('cuts the session of an account disabled afterwards', async () => {
    const id = await createUser(app, { username: 'bob', password: 'motdepasse1' });
    const cookie = await loginCookie('bob', 'motdepasse1');
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, id));
    expect((await request(server()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('global guard', () => {
  it('answers 401 on any route without a session, except login and health', async () => {
    expect((await request(server()).get('/api/locations')).status).toBe(401);
    expect((await request(server()).post('/api/anything')).status).toBe(401);
    expect((await request(server()).delete('/api/products/1')).status).toBe(401);
    expect((await request(server()).get('/api/health')).status).toBe(200);
  });

  it('answers 404 on an unknown route with a session', async () => {
    const cookie = await loginCookie('lucas', 'motdepasse1');
    expect((await request(server()).get('/api/nothing-here').set('Cookie', cookie)).status).toBe(
      404,
    );
  });
});

describe('first admin', () => {
  it('is created from the environment when no user exists, and only once', async () => {
    await resetAuth(app);
    const bootstrap = app.get(BootstrapAdminService);
    expect(await bootstrap.bootstrap()).toBe(true);
    expect(await bootstrap.bootstrap()).toBe(false);
    const [row] = await db.select({ n: count() }).from(users);
    expect(row!.n).toBe(1);
    const res = await login(process.env['ADMIN_USERNAME']!, process.env['ADMIN_PASSWORD']!);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  it('does nothing when a user already exists', async () => {
    expect(await app.get(BootstrapAdminService).bootstrap()).toBe(false);
  });
});
