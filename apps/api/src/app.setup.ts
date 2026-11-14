import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Shared by main.ts and the test application so that both behave the same. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
