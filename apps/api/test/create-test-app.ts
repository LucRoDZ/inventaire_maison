import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CLOCK, type Clock } from '../src/common/clock';
import { APP_CONFIG } from '../src/config/config.module';
import { parseEnv } from '../src/config/env.schema';

export interface TestAppOptions {
  clock?: Clock;
  /** Extra controllers, for routes that only exist in tests. */
  controllers?: Type<unknown>[];
  /** Global rate limit for this app (the test setup raises it for all the others). */
  rateLimitPerMinute?: number;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  if (options.rateLimitPerMinute !== undefined) {
    builder = builder
      .overrideProvider(APP_CONFIG)
      .useValue({ ...parseEnv(process.env), RATE_LIMIT_PER_MINUTE: options.rateLimitPerMinute });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
