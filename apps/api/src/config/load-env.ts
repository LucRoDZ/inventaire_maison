import { existsSync } from 'node:fs';
import path from 'node:path';

const MAX_LEVELS = 6;

/**
 * Loads the nearest `.env` above `startDir` (the repository root one in practice) for local runs:
 * `npm run dev`, `db:migrate`, `db:seed`. Variables already set in the environment win.
 * Never used in production (Docker passes the variables) nor in tests (they set their own).
 * Returns the loaded file, or null.
 */
export function loadLocalEnv(startDir: string, nodeEnv = process.env['NODE_ENV']): string | null {
  if (nodeEnv === 'production' || nodeEnv === 'test') return null;
  let dir = path.resolve(startDir);
  for (let level = 0; level < MAX_LEVELS; level++) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
