import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

/**
 * RATE_LIMIT_PER_MINUTE requests per minute and per IP (300 by default); /api/health is exempt
 * (@SkipThrottle). Import before the modules that add other guards.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [{ ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE }],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
