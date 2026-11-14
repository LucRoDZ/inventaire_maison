import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

export const GLOBAL_LIMIT_PER_MINUTE = 300;

/** 300 requests per minute and per IP. Import before the modules that add other guards. */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT_PER_MINUTE }])],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
