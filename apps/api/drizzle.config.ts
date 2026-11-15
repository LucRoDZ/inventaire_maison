import { defineConfig } from 'drizzle-kit';
import { loadLocalEnv } from './src/config/load-env';

// drizzle-kit does not start Nest: load the root .env here too (npm runs it from apps/api).
loadLocalEnv(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
