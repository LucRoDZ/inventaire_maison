import type { INestApplication } from '@nestjs/common';
import { count } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { createUser, FakeClock, MINUTE, HOUR, ORIGIN, resetAuth } from '../../test/helpers';
import { DB, type Database } from '../database/database.module';
import { loginAttempts } from '../database/schema';
import { LoginThrottleService } from './login-throttle.service';

let app: INestApplication;
let clock: FakeClock;

const login = (username: string, password: string, ip = '10.0.0.1') =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({ username, password });

async function fail(times: number, username = 'lucas', ip = '10.0.0.1'): Promise<void> {
  for (let i = 0; i < times; i++) {
    expect((await login(username, 'mauvais', ip)).status).toBe(401);
  }
}

beforeAll(async () => {
  clock = new FakeClock();
  app = await createTestApp({ clock });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAuth(app);
  await createUser(app, { username: 'lucas', password: 'motdepasse1' });
  await createUser(app, { username: 'bob', password: 'motdepasse1' });
});

describe('login throttling', () => {
  it('blocks the sixth attempt with 429 and Retry-After', async () => {
    await fail(5);
    const res = await login('lucas', 'mauvais');
    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Trop de tentatives, réessayez dans 15 minutes');
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it('blocks even with the right password', async () => {
    await fail(5);
    expect((await login('lucas', 'motdepasse1')).status).toBe(429);
  });

  it('unblocks after 15 minutes', async () => {
    await fail(5);
    clock.advance(14 * MINUTE);
    expect((await login('lucas', 'motdepasse1')).status).toBe(429);
    clock.advance(2 * MINUTE);
    expect((await login('lucas', 'motdepasse1')).status).toBe(200);
  });

  it('does not block another IP or another username', async () => {
    await fail(5);
    expect((await login('lucas', 'motdepasse1', '10.0.0.2')).status).toBe(200);
    expect((await login('bob', 'motdepasse1')).status).toBe(200);
  });

  it('treats the username without case', async () => {
    await fail(3, 'lucas');
    await fail(2, 'LUCAS');
    expect((await login('Lucas', 'motdepasse1')).status).toBe(429);
  });

  it('resets the failures of the pair after a success', async () => {
    await fail(4);
    expect((await login('lucas', 'motdepasse1')).status).toBe(200);
    await fail(4);
    expect((await login('lucas', 'motdepasse1')).status).toBe(200);
  });

  it('counts failures for unknown usernames too', async () => {
    await fail(5, 'personne');
    expect((await login('personne', 'x')).status).toBe(429);
  });

  it('forgets failures older than the 15-minute window', async () => {
    await fail(4);
    clock.advance(16 * MINUTE);
    await fail(4);
    expect((await login('lucas', 'motdepasse1')).status).toBe(200);
  });

  it('counts at most 5 attempts for 10 simultaneous wrong logins, the others get 429', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => login('lucas', `mauvais-${i}`)),
    );
    const statuses = responses.map((res) => res.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    const [row] = await app.get<Database>(DB).select({ n: count() }).from(loginAttempts);
    expect(row!.n).toBeLessThanOrEqual(5);
    expect((await login('lucas', 'motdepasse1')).status).toBe(429);
  });

  it('purges attempts older than 24 hours', async () => {
    await fail(2);
    clock.advance(25 * HOUR);
    await app.get(LoginThrottleService).purge();
    const [row] = await app.get<Database>(DB).select({ n: count() }).from(loginAttempts);
    expect(row!.n).toBe(0);
  });
});

describe('global rate limit', () => {
  it('answers 429 beyond 300 requests per minute and per IP', async () => {
    const limited = await createTestApp();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 302; i++) {
        statuses.push((await request(limited.getHttpServer()).get('/api/health')).status);
      }
      expect(statuses.slice(0, 300).every((s) => s === 200)).toBe(true);
      expect(statuses[300]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
