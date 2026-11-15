import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app';
import { createUser, ORIGIN, resetAuth } from '../test/helpers';
import { proxySecretMiddleware } from './app.setup';

const SECRET = 'proxy-secret-for-tests-0123456789';

describe('proxySecretMiddleware', () => {
  const run = (headers: Record<string, string>) => {
    const req = { headers } as unknown as Parameters<ReturnType<typeof proxySecretMiddleware>>[0];
    proxySecretMiddleware(SECRET)(req, {} as never, () => undefined);
    return req.headers;
  };

  it('keeps X-Forwarded-* when the secret matches, and never leaks the secret header', () => {
    const headers = run({ 'x-proxy-secret': SECRET, 'x-forwarded-for': '203.0.113.9' });
    expect(headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(headers['x-proxy-secret']).toBeUndefined();
  });

  it.each([
    ['is missing', {}],
    ['is wrong', { 'x-proxy-secret': 'wrong-secret-wrong-secret-0000' }],
    ['has another length', { 'x-proxy-secret': 'x' }],
  ])('drops X-Forwarded-* when the secret %s', (_label, extra) => {
    const headers = run({
      ...extra,
      'x-forwarded-for': '203.0.113.9',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.test',
    });
    expect(headers['x-forwarded-for']).toBeUndefined();
    expect(headers['x-forwarded-proto']).toBeUndefined();
    expect(headers['x-forwarded-host']).toBeUndefined();
  });
});

describe('client address with PROXY_SECRET set', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ proxySecret: SECRET });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetAuth(app);
    await createUser(app, { username: 'lucas', password: 'motdepasse1' });
  });

  const login = (ip: string, secret?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', ip);
    if (secret) req.set('X-Proxy-Secret', secret);
    return req.send({ username: 'lucas', password: 'mauvais' });
  };

  it('ignores a forged X-Forwarded-For: rotating addresses does not dodge the login throttle', async () => {
    for (let i = 1; i <= 5; i++) expect((await login(`198.51.100.${i}`)).status).toBe(401);
    expect((await login('198.51.100.99')).status).toBe(429);
  });

  it('honours X-Forwarded-For when the proxy secret is sent', async () => {
    for (let i = 1; i <= 5; i++) expect((await login('192.0.2.7', SECRET)).status).toBe(401);
    expect((await login('192.0.2.7', SECRET)).status).toBe(429);
    expect((await login('192.0.2.8', SECRET)).status).toBe(401);
  });
});
