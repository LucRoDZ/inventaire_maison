import type { Pool, PoolClient } from 'pg';

/**
 * Privileges of the runtime role, table by table (least privilege). Every table of the public
 * schema must appear here: a test fails otherwise, so that a new table never ships without a
 * decision about who may touch it.
 */
export const APP_ROLE_PRIVILEGES: Readonly<Record<string, string>> = {
  households: 'SELECT, INSERT, UPDATE, DELETE',
  // Accounts are disabled, never deleted (history kept).
  users: 'SELECT, INSERT, UPDATE',
  sessions: 'SELECT, INSERT, UPDATE, DELETE',
  login_attempts: 'SELECT, INSERT, DELETE',
  locations: 'SELECT, INSERT, UPDATE, DELETE',
  shelves: 'SELECT, INSERT, UPDATE, DELETE',
  categories: 'SELECT, INSERT, UPDATE, DELETE',
  off_category_map: 'SELECT, INSERT, UPDATE, DELETE',
  // No product deletion in the application (M10); an empty household is removed by cascade, which
  // runs as the table owner.
  products: 'SELECT, INSERT, UPDATE',
  stock_items: 'SELECT, INSERT, UPDATE, DELETE',
  // The journal is never modified.
  stock_movements: 'SELECT, INSERT',
  settings: 'SELECT, INSERT, UPDATE',
  shopping_items: 'SELECT, INSERT, UPDATE, DELETE',
  push_subscriptions: 'SELECT, INSERT, UPDATE, DELETE',
};

/** Tables whose rows belong to a household: row-level secured, reached through TenantDb only. */
export const HOUSEHOLD_TABLES = [
  'locations',
  'shelves',
  'categories',
  'off_category_map',
  'products',
  'stock_items',
  'stock_movements',
  'settings',
  'shopping_items',
  'push_subscriptions',
] as const;

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export class AppRoleError extends Error {}

export interface AppRoleCredentials {
  user: string;
  password: string;
}

/** User and password of the runtime role, read from DATABASE_URL. */
export function appRoleFrom(databaseUrl: string): AppRoleCredentials {
  const url = new URL(databaseUrl);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!ROLE_NAME.test(user)) {
    throw new AppRoleError('DATABASE_URL : nom de rôle invalide (minuscules, chiffres, _)');
  }
  if (password.length < 8) {
    throw new AppRoleError(
      'DATABASE_URL : mot de passe du rôle applicatif trop court (8 au moins)',
    );
  }
  return { user, password };
}

async function execFormatted(
  client: PoolClient,
  template: string,
  args: readonly string[],
): Promise<void> {
  // format() quotes identifiers (%I) and literals (%L) on the server: nothing is spliced by hand.
  const placeholders = args.map((_, i) => `$${i + 2}::text`).join(', ');
  const { rows } = await client.query<{ statement: string }>(
    `SELECT format($1::text, ${placeholders}) AS statement`,
    [template, ...args],
  );
  await client.query(rows[0]!.statement);
}

/**
 * Run by the migrator (owner connection), after the migrations: creates the runtime role when it
 * does not exist, sets its password from DATABASE_URL and its attributes (no superuser, no
 * BYPASSRLS), then grants exactly the privileges above. Safe to run at every start.
 */
export async function ensureAppRole(owner: Pool, role: AppRoleCredentials): Promise<void> {
  const client = await owner.connect();
  try {
    const { rows: me } = await client.query<{ user: string }>('SELECT current_user AS "user"');
    if (me[0]?.user === role.user) {
      throw new AppRoleError(
        'DATABASE_URL et DATABASE_MIGRATION_URL doivent utiliser deux rôles différents',
      );
    }
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
      role.user,
    ]);
    if (!rowCount) {
      // Two processes may start together: the loser of the race just uses the role.
      await client.query('SAVEPOINT create_role');
      try {
        await execFormatted(client, 'CREATE ROLE %I LOGIN', [role.user]);
        await client.query('RELEASE SAVEPOINT create_role');
      } catch (error) {
        if ((error as { code?: string }).code !== '42710') throw error;
        await client.query('ROLLBACK TO SAVEPOINT create_role');
      }
    }
    await execFormatted(
      client,
      'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L',
      [role.user, role.password],
    );
    await execFormatted(client, 'GRANT CONNECT ON DATABASE %I TO %I', [
      (await client.query<{ db: string }>('SELECT current_database() AS db')).rows[0]!.db,
      role.user,
    ]);
    await execFormatted(client, 'GRANT USAGE ON SCHEMA public TO %I', [role.user]);
    await execFormatted(client, 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', [role.user]);
    for (const [table, privileges] of Object.entries(APP_ROLE_PRIVILEGES)) {
      await execFormatted(client, `GRANT ${privileges} ON TABLE %I TO %I`, [table, role.user]);
    }
    await execFormatted(client, 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', [
      role.user,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Refuses a runtime connection that would bypass row-level security. */
export async function assertRuntimeRole(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new AppRoleError(
      'DATABASE_URL doit utiliser un rôle sans superutilisateur ni BYPASSRLS (inventaire_app)',
    );
  }
}
