import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PG_POOL } from '../database/database.module';
import { createTestApp } from '../../test/create-test-app';

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

  it('returns 503 with status error when the pool fails', async () => {
    const pool = app.get<Pool>(PG_POOL);
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
  });
});
