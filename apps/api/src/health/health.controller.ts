import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@inventaire/shared';
import type { Pool } from 'pg';
import { Public } from '../auth/public.decorator';
import { PG_POOL } from '../database/database.module';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      const body: HealthResponse = { status: 'error' };
      throw new ServiceUnavailableException(body);
    }
    return { status: 'ok' };
  }
}
