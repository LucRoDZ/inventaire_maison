import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CLOCK, type Clock } from '../src/common/clock';

export interface TestAppOptions {
  clock?: Clock;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
