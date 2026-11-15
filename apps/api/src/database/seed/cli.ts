import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { loadLocalEnv } from '../../config/load-env';

/** `npm run db:seed`: boots the application context (migrations, then seed) without listening. */
async function run(): Promise<void> {
  loadLocalEnv(__dirname);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error'] });
  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
