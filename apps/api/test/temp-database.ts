import { randomBytes } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { MIGRATIONS_FOLDER } from '../src/database/database.module';

export interface TempDatabase {
  name: string;
  /** Owner URL of the temporary database. */
  url: string;
  pool: Pool;
  db: NodePgDatabase;
  drop(): Promise<void>;
}

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Creates an empty database next to the test one, migrated up to the latest migration (or the
 * given folder), to be dropped after the test. Connected as the owner (a superuser in tests).
 */
export async function createTempDatabase(
  options: { migrate?: boolean; migrationsFolder?: string } = {},
): Promise<TempDatabase> {
  const baseUrl = process.env['DATABASE_MIGRATION_URL'] as string;
  const name = `inv_tmp_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: baseUrl });
  await admin.query(`CREATE DATABASE ${name}`);
  const pool = new Pool({ connectionString: withDatabase(baseUrl, name) });
  const db = drizzle(pool);
  if (options.migrate !== false) {
    await migrate(db, { migrationsFolder: options.migrationsFolder ?? MIGRATIONS_FOLDER });
  }
  return {
    name,
    url: withDatabase(baseUrl, name),
    pool,
    db,
    async drop() {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
