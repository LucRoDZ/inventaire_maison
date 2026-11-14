import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1).startsWith('postgres'),
  SESSION_SECRET: z.string().min(32),
  ADMIN_USERNAME: z.string().trim().min(1),
  ADMIN_PASSWORD: z.string().min(8),
  OFF_USER_AGENT: z.string().min(1).default('InventaireMaison/1.0'),
  OFF_BASE_URL: z.string().url().optional(),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
  IMAGES_DIR: z.string().min(1).default('./data/images'),
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
  // The test double of Open Food Facts is never honoured in production.
  if (config.NODE_ENV === 'production') delete config.OFF_BASE_URL;
  return config;
}
