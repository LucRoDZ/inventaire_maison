import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config.module';
import { EnvError } from './config/env.schema';
import type { AppConfig } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
}

bootstrap().catch((error: unknown) => {
  // EnvError carries variable names only; other errors are logged without the environment.
  console.error(error instanceof EnvError ? error.message : error);
  process.exit(1);
});
