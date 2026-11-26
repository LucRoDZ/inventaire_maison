import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard (decision A.2): the household data tables are reached through TenantDb only. A
 * source file that injects the raw connection (DB or PG_POOL) must not name any of them, neither as
 * a Drizzle table nor in raw SQL. Fails as soon as a service bypasses TenantDb.
 */
const SRC = path.resolve(__dirname, '../src');
const DATA_TABLES = [
  'locations',
  'shelves',
  'categories',
  'offCategoryMap',
  'products',
  'stockItems',
  'stockMovements',
  'settings',
  'shoppingItems',
  'pushSubscriptions',
  'idempotencyKeys',
];
const SQL_TABLES = [
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
  'idempotency_keys',
];
/** The gate itself. */
const ALLOWED = new Set(['database/tenant-db.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

/** Problems of one source text; exported logic is exercised below on good and bad samples. */
export function offences(text: string): string[] {
  const injectsRaw = /@Inject\(\s*(DB|PG_POOL)\s*\)/.test(text);
  if (!injectsRaw) return [];
  const found: string[] = [];
  // A Drizzle table can only be used once imported from the schema module.
  const imported = [
    ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*(database\/)?schema(\/index)?'/g),
  ]
    .flatMap((m) => m[1]!.split(','))
    .map((name) => name.trim().split(/\s+as\s+/)[0]!);
  for (const table of DATA_TABLES) {
    if (imported.includes(table)) found.push(table);
  }
  for (const table of SQL_TABLES) {
    if (new RegExp(`\\b(from|into|update|join|table)\\s+"?${table}\\b`, 'i').test(text)) {
      found.push(`SQL ${table}`);
    }
  }
  return found;
}

describe('access to household data', () => {
  it('goes through TenantDb in every source file', () => {
    const problems = sources(SRC).flatMap((file) => {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED.has(relative)) return [];
      return offences(readFileSync(file, 'utf8')).map((what) => `${relative}: ${what}`);
    });
    expect(problems).toEqual([]);
  });

  it('flags a service that injects DB and touches a data table', () => {
    expect(
      offences(`import { products, users } from '../database/schema';
        constructor(@Inject(DB) private readonly db: Database) {}
        list() { return this.db.select().from(products); }`),
    ).toEqual(['products']);
    expect(
      offences(`constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
        n() { return this.pool.query('SELECT count(*) FROM stock_items'); }`),
    ).toEqual(['SQL stock_items']);
    expect(
      offences(`import { users } from '../database/schema';
        // the categories of the locations are elsewhere
        constructor(@Inject(DB) private readonly db: Database) {}
        list() { return this.db.select().from(users); }`),
    ).toEqual([]);
    expect(
      offences(`constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}
        list() { return this.tenant.run((tx) => tx.select().from(products)); }`),
    ).toEqual([]);
  });
});
