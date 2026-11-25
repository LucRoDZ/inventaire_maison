import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createTestApp } from '../../test/create-test-app';
import { PG_POOL } from '../database/database.module';

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok when the database answers', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sends the security headers and no X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const unauthenticated = await request(app.getHttpServer()).get('/api/auth/me');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['x-content-type-options']).toBe('nosniff');
    // Nothing of the API is kept by a browser or a proxy.
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(unauthenticated.headers['cache-control']).toBe('private, no-store');
    expect(unauthenticated.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 503 with status error when the pool fails', async () => {
    const pool = app.get<Pool>(PG_POOL);
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
  });
});
