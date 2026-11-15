import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/env.schema';

/** Shared by main.ts and the test application so that both behave the same. */
/** Security headers sent on every API response, whatever the proxy in front (decision M13). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

const FORWARDED_HEADERS = ['x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'] as const;

function sameSecret(received: string | string[] | undefined, expected: string): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Drops X-Forwarded-* from requests that do not carry the proxy secret, so that `req.ip` is then
 * the address of the direct peer. Must run before anything reads the client address.
 */
export function proxySecretMiddleware(secret: string) {
  return (req: IncomingMessage, _res: ServerResponse, next: () => void): void => {
    if (!sameSecret(req.headers['x-proxy-secret'], secret)) {
      for (const name of FORWARDED_HEADERS) delete req.headers[name];
    }
    delete req.headers['x-proxy-secret'];
    next();
  };
}

export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const proxySecret = app.get<AppConfig>(APP_CONFIG).PROXY_SECRET;
  if (proxySecret) express.use(proxySecretMiddleware(proxySecret));
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
