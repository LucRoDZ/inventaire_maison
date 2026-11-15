import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '@inventaire/shared';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1).startsWith('postgres'),
  SESSION_SECRET: z.string().min(32),
  // Same rules as the accounts created later (M6) and as the login form: usable to sign in.
  ADMIN_USERNAME: z.string().trim().toLowerCase().regex(USERNAME_PATTERN),
  ADMIN_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  OFF_USER_AGENT: z.string().min(1).default('InventaireMaison/1.0'),
  OFF_BASE_URL: z.string().url().optional(),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
  /**
   * Shared with the reverse proxy, which sends it in `X-Proxy-Secret`. When set, X-Forwarded-* is
   * honoured only on requests that carry it: another container on the same Docker network cannot
   * forge its client address (rate limit, login throttle).
   */
  PROXY_SECRET: z.string().min(16).optional(),
  IMAGES_DIR: z.string().min(1).default('./data/images'),
  /** Global limit per IP; the tests raise it so that their many requests from 127.0.0.1 pass. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
});

export type AppConfig = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(readonly variables: string[]) {
    super(`Configuration invalide, variables à corriger : ${variables.join(', ')}`);
    this.name = 'EnvError';
  }
}

/** Validates the environment. The error names the variables, never their values. */
export function parseEnv(raw: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '?')))];
    throw new EnvError(names);
  }
  const config = result.data;
  if (config.NODE_ENV === 'production') {
    // The values of .env.example are public: refuse to run with them.
    const placeholders = (
      [
        ['SESSION_SECRET', config.SESSION_SECRET],
        ['ADMIN_PASSWORD', config.ADMIN_PASSWORD],
        ['DATABASE_URL', config.DATABASE_URL],
        ['PROXY_SECRET', config.PROXY_SECRET],
      ] as const
    )
      .filter(([, value]) => value?.includes('change-me'))
      .map(([name]) => name);
    if (placeholders.length > 0) throw new EnvError(placeholders);
  }
  // The test double of Open Food Facts is never honoured in production.
  if (config.NODE_ENV === 'production') delete config.OFF_BASE_URL;
  return config;
}
