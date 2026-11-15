import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Shared by main.ts and the test application so that both behave the same. */
/** Security headers sent on every API response, whatever the proxy in front (decision M13). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  // One trusted reverse proxy (Caddy or the shared nginx): req.ip is the client address.
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  express.use(
    (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
      next();
    },
  );
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
