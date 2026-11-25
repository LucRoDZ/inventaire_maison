import type { INestApplication } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { createHousehold, HOUSEHOLD, ownerPool, resetAll, seedHousehold } from '../../test/helpers';
import { APP_ROLE_PRIVILEGES, HOUSEHOLD_TABLES, appRoleFrom } from './app-role';

let app: INestApplication;
let runtime: Pool;
let a: number;
let b: number;

/** A transaction on the runtime role, bound (or not) to a household. */
async function inHousehold<T>(
  householdId: number | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await runtime.connect();
  try {
    await client.query('BEGIN');
    if (householdId !== null) {
      await client.query(`SELECT set_config('app.household_id', $1, true)`, [String(householdId)]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const countOf = async (client: PoolClient, table: string) =>
  (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

beforeAll(async () => {
  app = await createTestApp();
  await resetAll();
  await seedHousehold(app);
  a = HOUSEHOLD;
  b = await createHousehold(app, 'Voisins');
  runtime = new Pool({ connectionString: process.env['DATABASE_URL'] });
});

afterAll(async () => {
  await runtime.end();
  await app.close();
});

describe('row-level security', () => {
  it('shows no row at all without a household in the transaction', async () => {
    const owner = await ownerPool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM categories',
    );
    expect(owner.rows[0]!.n).toBe(30);
    await inHousehold(null, async (client) => {
      for (const table of HOUSEHOLD_TABLES) expect(await countOf(client, table), table).toBe(0);
    });
    // Outside any transaction too.
    expect((await runtime.query('SELECT * FROM locations')).rows).toHaveLength(0);
  });

  it('shows only the rows of the household of the transaction', async () => {
    await inHousehold(a, async (client) => {
      const { rows } = await client.query<{ household_id: number }>(
        'SELECT DISTINCT household_id FROM categories',
      );
      expect(rows).toEqual([{ household_id: a }]);
      expect(await countOf(client, 'locations')).toBe(4);
    });
  });

  it('refuses to write a row of another household, and to change or delete one', async () => {
    await inHousehold(a, async (client) => {
      await client.query('SAVEPOINT s');
      await expect(
        client.query(
          `INSERT INTO categories (household_id, name, icon) VALUES ($1, 'Intrus', 'package')`,
          [b],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK TO SAVEPOINT s');
      // Rows of B are invisible: updating or deleting them touches nothing.
      const updated = await client.query(
        `UPDATE locations SET name = name || ' x' WHERE household_id = $1`,
        [b],
      );
      expect(updated.rowCount).toBe(0);
      const deleted = await client.query('DELETE FROM shelves WHERE household_id = $1', [b]);
      expect(deleted.rowCount).toBe(0);
      // Moving one of its own rows to B is refused too (WITH CHECK).
      await expect(
        client.query('UPDATE locations SET household_id = $1 WHERE household_id = $2', [b, a]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('fills household_id from the transaction when an insert omits it', async () => {
    await inHousehold(b, async (client) => {
      const { rows } = await client.query<{ household_id: number }>(
        `INSERT INTO categories (name, icon) VALUES ('Sans colonne', 'package') RETURNING household_id`,
      );
      expect(rows[0]!.household_id).toBe(b);
    });
  });

  it('is enabled and forced on every table that has a household_id column', async () => {
    const { rows } = await ownerPool().query<{
      table_name: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>(
      `SELECT c.table_name, t.relrowsecurity AS rls, t.relforcerowsecurity AS forced,
              (SELECT count(*)::int FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.table_name) AS policies
         FROM information_schema.columns c
         JOIN pg_class t ON t.relname = c.table_name
         JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
        WHERE c.table_schema = 'public' AND c.column_name = 'household_id' AND t.relkind = 'r'`,
    );
    const secured = rows.filter((r) => r.table_name !== 'users');
    expect(secured.map((r) => r.table_name).sort()).toEqual([...HOUSEHOLD_TABLES].sort());
    for (const row of secured) {
      expect(row, row.table_name).toMatchObject({ rls: true, forced: true });
      expect(row.policies, row.table_name).toBeGreaterThan(0);
    }
  });
});

describe('runtime role', () => {
  it('is neither superuser nor BYPASSRLS, and owns no table', async () => {
    const role = appRoleFrom(process.env['DATABASE_URL']!).user;
    const { rows } = await ownerPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [role],
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    const owned = await ownerPool().query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = $1`,
      [role],
    );
    expect(owned.rows).toEqual([]);
  });

  it('has declared privileges for exactly the tables of the schema', async () => {
    const { rows } = await ownerPool().query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    expect(Object.keys(APP_ROLE_PRIVILEGES).sort()).toEqual(rows.map((r) => r.tablename).sort());
  });

  it('can neither modify the journal nor truncate a table', async () => {
    await inHousehold(a, async (client) => {
      for (const statement of [
        'UPDATE stock_movements SET delta = 1',
        'DELETE FROM stock_movements',
        'DELETE FROM products',
        'TRUNCATE locations',
        'DELETE FROM users',
      ]) {
        await client.query('SAVEPOINT s');
        await expect(client.query(statement), statement).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK TO SAVEPOINT s');
      }
    });
  });
});
