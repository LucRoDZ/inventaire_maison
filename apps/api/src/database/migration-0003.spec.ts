import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../../test/temp-database';
import { MIGRATIONS_FOLDER } from './database.module';

/**
 * Migration 0003 on a database filled with the schema of 0002 (decision D4): everything goes to
 * the household « Famille », nothing is lost, the constraints hold, and running it again changes
 * nothing.
 */
let tmp: TempDatabase;
let oldFolder: string;

/** A copy of the migrations folder that stops at 0002. */
function migrationsUpTo0002(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'inv-migrations-'));
  cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
  const journalFile = path.join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as {
    entries: { idx: number }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 2);
  writeFileSync(journalFile, JSON.stringify(journal));
  return dir;
}

const q = async <T extends object>(text: string, params: unknown[] = []) =>
  (await tmp.pool.query<T>(text, params)).rows;

const TABLES = [
  'users',
  'locations',
  'shelves',
  'categories',
  'off_category_map',
  'products',
  'stock_items',
  'stock_movements',
];

async function counts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    result[table] = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n;
  }
  return result;
}

beforeAll(async () => {
  oldFolder = migrationsUpTo0002();
  tmp = await createTempDatabase({ migrationsFolder: oldFolder });
  // A family database of the previous version.
  await q(
    `INSERT INTO users (username, password_hash, role) VALUES ('lucas', 'x', 'admin'), ('marie', 'y', 'member')`,
  );
  await q(`INSERT INTO locations (name, kind, icon, sort_order) VALUES
    ('Frigo', 'fridge', 'refrigerator', 0), ('Cave', 'cellar', 'wine', 1), ('CAVE', 'cellar', 'wine', 2)`);
  await q(`INSERT INTO shelves (location_id, name, kind, sort_order) VALUES
    (1, 'Étagère 1', 'plain', 0), (1, 'Étagère 2', 'plain', 1), (2, 'Rangée 1', 'rack', 0)`);
  await q(`INSERT INTO categories (name, icon, sort_order, is_fallback) VALUES
    ('Boissons', 'cup-soda', 0, false), ('Autre', 'package', 1, true)`);
  await q(`INSERT INTO off_category_map (off_tag, category_id) VALUES ('en:waters', 1)`);
  await q(`INSERT INTO products (barcode, name, category_id, default_location_id, search_text, created_by)
    VALUES ('3017620422003', 'Nutella', 2, 1, 'nutella', 1), (NULL, 'Tomates', 2, NULL, 'tomates', 2)`);
  await q(
    `INSERT INTO stock_items (product_id, location_id, shelf_id, quantity) VALUES (1, 1, 2, 3), (2, 2, NULL, 1)`,
  );
  await q(`INSERT INTO stock_movements (product_id, location_id, shelf_id, delta, reason, user_id) VALUES
    (1, 1, 2, 3, 'scan_add', 1), (2, 2, NULL, 1, 'manual', 2), (2, 1, 999, 1, 'manual', 2)`);
}, 120_000);

afterAll(async () => {
  await tmp.drop();
  rmSync(oldFolder, { recursive: true, force: true });
});

describe('migration 0003 on a populated database', () => {
  let before: Record<string, number>;

  it('attaches everything to « Famille » without losing a row', async () => {
    before = await counts();
    await migrate(drizzle(tmp.pool), { migrationsFolder: MIGRATIONS_FOLDER });
    expect(await counts()).toEqual(before);
    const households = await q<{ id: number; name: string }>('SELECT id, name FROM households');
    expect(households).toEqual([{ id: 1, name: 'Famille' }]);
    for (const table of TABLES) {
      const rows = await q<{ household_id: number }>(`SELECT DISTINCT household_id FROM ${table}`);
      expect(rows, table).toEqual([{ household_id: 1 }]);
    }
  });

  it('renames furniture whose names only differ by their case', async () => {
    const names = await q<{ name: string }>('SELECT name FROM locations ORDER BY id');
    expect(names.map((r) => r.name)).toEqual(['Frigo', 'Cave', 'CAVE (3)']);
  });

  it('keeps the history with the names of the places, even a shelf deleted earlier', async () => {
    const rows = await q<{ location_name: string; shelf_name: string | null; shelf_id: number }>(
      'SELECT location_name, shelf_name, shelf_id FROM stock_movements ORDER BY id',
    );
    expect(rows).toEqual([
      { location_name: 'Frigo', shelf_name: 'Étagère 2', shelf_id: 2 },
      { location_name: 'Cave', shelf_name: null, shelf_id: null },
      { location_name: 'Frigo', shelf_name: null, shelf_id: 999 },
    ]);
  });

  it('leaves every constraint valid and row-level security on', async () => {
    const invalid = await q(
      `SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND NOT c.convalidated`,
    );
    expect(invalid).toEqual([]);
    const secured = await q<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity ORDER BY relname`,
    );
    expect(secured.map((r) => r.relname)).toEqual([
      'categories',
      'locations',
      'off_category_map',
      'products',
      'push_subscriptions',
      'settings',
      'shelves',
      'shopping_items',
      'stock_items',
      'stock_movements',
    ]);
  });

  it('does nothing when it runs again', async () => {
    const applied = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
    );
    await migrate(drizzle(tmp.pool), { migrationsFolder: MIGRATIONS_FOLDER });
    expect(await counts()).toEqual(before);
    expect(await q('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).toEqual(applied);
    expect(await q('SELECT count(*)::int AS n FROM households')).toEqual([{ n: 1 }]);
  });
});
