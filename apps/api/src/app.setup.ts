import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Shared by main.ts and the test application so that both behave the same. */
export function configureApp(app: INestApplication): void {
  // One trusted reverse proxy (Caddy or the shared nginx): req.ip is the client address.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
