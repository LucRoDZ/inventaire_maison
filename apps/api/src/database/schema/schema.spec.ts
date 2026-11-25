import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../../../test/temp-database';
import {
  categories,
  households,
  locations,
  offCategoryMap,
  products,
  shelves,
  stockItems,
  stockMovements,
  users,
} from './index';

let tmp: TempDatabase;

beforeAll(async () => {
  tmp = await createTempDatabase();
});

afterAll(async () => {
  await tmp.drop();
});

beforeEach(async () => {
  await tmp.db.execute(
    sql`TRUNCATE stock_movements, stock_items, products, off_category_map, categories, shelves, locations, sessions, users, households RESTART IDENTITY CASCADE`,
  );
});

async function household(name: string): Promise<number> {
  const [row] = await tmp.db.insert(households).values({ name }).returning();
  return row!.id;
}

async function seedBase(householdId?: number) {
  const h = householdId ?? (await household('Famille'));
  const [category] = await tmp.db
    .insert(categories)
    .values({ householdId: h, name: 'Boissons', icon: 'cup-soda' })
    .returning();
  const [location] = await tmp.db
    .insert(locations)
    .values({ householdId: h, name: 'Frigo', kind: 'fridge', icon: 'refrigerator' })
    .returning();
  const [shelf] = await tmp.db
    .insert(shelves)
    .values({ householdId: h, locationId: location!.id, name: 'Étagère 1' })
    .returning();
  const [product] = await tmp.db
    .insert(products)
    .values({ householdId: h, name: 'Lait', categoryId: category!.id })
    .returning();
  const [user] = await tmp.db
    .insert(users)
    .values({ householdId: h, username: `lucas${h}`, passwordHash: 'x', role: 'admin' })
    .returning();
  return {
    householdId: h,
    category: category!,
    location: location!,
    shelf: shelf!,
    product: product!,
    user: user!,
  };
}

const movement = (b: Awaited<ReturnType<typeof seedBase>>, delta: number, reason = 'manual') => ({
  householdId: b.householdId,
  productId: b.product.id,
  locationId: b.location.id,
  locationName: b.location.name,
  delta,
  reason,
  userId: b.user.id,
});

describe('migration', () => {
  it('creates every table and the pg_trgm extension on an empty database', async () => {
    const tables = await tmp.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'households',
        'users',
        'sessions',
        'login_attempts',
        'locations',
        'shelves',
        'categories',
        'off_category_map',
        'products',
        'stock_items',
        'stock_movements',
      ]),
    );
    const ext = await tmp.pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
    expect(ext.rowCount).toBe(1);
  });

  it('creates the required indexes', async () => {
    const result = await tmp.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const names = result.rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'products_search_text_trgm_idx',
        'stock_items_location_shelf_idx',
        'stock_items_expiry_date_idx',
        'products_household_barcode_key',
        'locations_household_idx',
        'stock_movements_household_idx',
      ]),
    );
  });

  it(
    'creates no household on an empty database (the first start does)',
    { timeout: 60_000 },
    async () => {
      const fresh = await createTempDatabase();
      try {
        const { rows } = await fresh.pool.query('SELECT * FROM households');
        expect(rows).toHaveLength(0);
      } finally {
        await fresh.drop();
      }
    },
  );
});

describe('constraints', () => {
  it('refuses two identical stock lines when shelf and expiry date are null', async () => {
    const { householdId, product, location } = await seedBase();
    const line = { householdId, productId: product.id, locationId: location.id, quantity: 1 };
    await tmp.db.insert(stockItems).values(line);
    await expect(tmp.db.insert(stockItems).values(line)).rejects.toThrow();
  });

  it('accepts the same product on different expiry dates', async () => {
    const { householdId, product, location } = await seedBase();
    const line = { householdId, productId: product.id, locationId: location.id, quantity: 1 };
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: '2026-12-01' });
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: '2026-12-02' });
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: null });
  });

  it('refuses a quantity of 0', async () => {
    const { householdId, product, location } = await seedBase();
    await expect(
      tmp.db
        .insert(stockItems)
        .values({ householdId, productId: product.id, locationId: location.id, quantity: 0 }),
    ).rejects.toThrow();
  });

  it('refuses a movement with a delta of 0 and an unknown reason', async () => {
    const base = await seedBase();
    await expect(tmp.db.insert(stockMovements).values(movement(base, 0))).rejects.toThrow();
    await expect(
      tmp.db.insert(stockMovements).values(movement(base, 1, 'magic')),
    ).rejects.toThrow();
  });

  it('accepts two products without a barcode but refuses a duplicate barcode in a household', async () => {
    const { householdId, category } = await seedBase();
    const base = { householdId, categoryId: category.id };
    await tmp.db.insert(products).values({ ...base, name: 'Tomates' });
    await tmp.db.insert(products).values({ ...base, name: 'Carottes' });
    await tmp.db.insert(products).values({ ...base, name: 'A', barcode: '3017620422003' });
    await expect(
      tmp.db.insert(products).values({ ...base, name: 'B', barcode: '3017620422003' }),
    ).rejects.toThrow();
  });

  it('accepts the same barcode, category name, tag and furniture name in two households', async () => {
    const a = await seedBase(await household('A'));
    const b = await seedBase(await household('B'));
    for (const h of [a, b]) {
      await tmp.db.insert(products).values({
        householdId: h.householdId,
        categoryId: h.category.id,
        name: 'Nutella',
        barcode: '3017620422003',
      });
      await tmp.db
        .insert(offCategoryMap)
        .values({ householdId: h.householdId, offTag: 'en:waters', categoryId: h.category.id });
    }
    // Both already have « Boissons » and « Frigo » from seedBase.
    const { rows } = await tmp.pool.query(`SELECT 1 FROM products WHERE barcode = '3017620422003'`);
    expect(rows).toHaveLength(2);
  });

  it('refuses a furniture name already used in the household, whatever its case', async () => {
    const { householdId } = await seedBase();
    await expect(
      tmp.db
        .insert(locations)
        .values({ householdId, name: 'FRIGO', kind: 'fridge', icon: 'refrigerator' }),
    ).rejects.toThrow();
  });

  it('refuses a duplicate username whatever its case, across households', async () => {
    const a = await household('A');
    const b = await household('B');
    await tmp.db.insert(users).values({ householdId: a, username: 'lucas', passwordHash: 'x' });
    await expect(
      tmp.db.insert(users).values({ householdId: b, username: 'Lucas', passwordHash: 'x' }),
    ).rejects.toThrow();
  });

  it('refuses an unknown role and an account without a household', async () => {
    const h = await household('A');
    await expect(
      tmp.db
        .insert(users)
        .values({ householdId: h, username: 'bob', passwordHash: 'x', role: 'root' }),
    ).rejects.toThrow();
    await expect(
      tmp.pool.query(`INSERT INTO users (username, password_hash) VALUES ('sans', 'x')`),
    ).rejects.toThrow();
  });

  it('refuses a stock line whose shelf belongs to another location', async () => {
    const { householdId, product, location, shelf } = await seedBase();
    const [cellar] = await tmp.db
      .insert(locations)
      .values({ householdId, name: 'Cave', kind: 'cellar', icon: 'wine' })
      .returning();
    const line = { householdId, productId: product.id };
    // Right shelf of the right location, and the "Non rangé" tray (no shelf) of another one: accepted.
    await tmp.db
      .insert(stockItems)
      .values({ ...line, locationId: location.id, shelfId: shelf.id, quantity: 1 });
    await tmp.db
      .insert(stockItems)
      .values({ ...line, locationId: cellar!.id, shelfId: null, quantity: 1 });
    // A fridge shelf on a cellar line: refused by stock_items_shelf_location_fk.
    await expect(
      tmp.db
        .insert(stockItems)
        .values({ ...line, locationId: cellar!.id, shelfId: shelf.id, quantity: 2 }),
    ).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'stock_items_shelf_location_fk' },
    });
  });

  it('never lets a row point at an object of another household (composite foreign keys)', async () => {
    const a = await seedBase(await household('A'));
    const b = await seedBase(await household('B'));
    const refused = (constraint: string) => ({ cause: { code: '23503', constraint } });

    await expect(
      tmp.db
        .insert(shelves)
        .values({ householdId: a.householdId, locationId: b.location.id, name: 'X' }),
    ).rejects.toMatchObject(refused('shelves_location_household_fk'));
    await expect(
      tmp.db.insert(stockItems).values({
        householdId: a.householdId,
        productId: b.product.id,
        locationId: a.location.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject(refused('stock_items_product_household_fk'));
    await expect(
      tmp.db.insert(stockItems).values({
        householdId: a.householdId,
        productId: a.product.id,
        locationId: b.location.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject(refused('stock_items_location_household_fk'));
    await expect(
      tmp.db
        .insert(products)
        .values({ householdId: a.householdId, name: 'X', categoryId: b.category.id }),
    ).rejects.toMatchObject(refused('products_category_household_fk'));
    await expect(
      tmp.db.insert(products).values({
        householdId: a.householdId,
        name: 'X',
        categoryId: a.category.id,
        defaultLocationId: b.location.id,
      }),
    ).rejects.toMatchObject(refused('products_default_location_household_fk'));
    await expect(
      tmp.db
        .insert(offCategoryMap)
        .values({ householdId: a.householdId, offTag: 'en:x', categoryId: b.category.id }),
    ).rejects.toMatchObject(refused('off_category_map_category_household_fk'));
    await expect(
      tmp.db.insert(stockMovements).values({ ...movement(a, 1), productId: b.product.id }),
    ).rejects.toMatchObject(refused('stock_movements_product_household_fk'));
  });

  it('clears only the default location of a product when its location is deleted', async () => {
    const { householdId, category, location } = await seedBase();
    const [product] = await tmp.db
      .insert(products)
      .values({
        householdId,
        name: 'Beurre',
        categoryId: category.id,
        defaultLocationId: location.id,
      })
      .returning();
    await tmp.db.delete(locations).where(sql`${locations.id} = ${location.id}`);
    const { rows } = await tmp.pool.query(
      'SELECT household_id, default_location_id FROM products WHERE id = $1',
      [product!.id],
    );
    expect(rows[0]).toEqual({ household_id: householdId, default_location_id: null });
  });

  it('keeps the journal when a piece of furniture is deleted', async () => {
    const base = await seedBase();
    await tmp.db.insert(stockMovements).values(movement(base, 2));
    await tmp.db.delete(locations).where(sql`${locations.id} = ${base.location.id}`);
    const { rows } = await tmp.pool.query('SELECT location_id, location_name FROM stock_movements');
    expect(rows).toEqual([{ location_id: base.location.id, location_name: 'Frigo' }]);
  });

  it('allows a single fallback category per household', async () => {
    const a = await household('A');
    const b = await household('B');
    await tmp.db
      .insert(categories)
      .values({ householdId: a, name: 'Autre', icon: 'package', isFallback: true });
    await tmp.db
      .insert(categories)
      .values({ householdId: b, name: 'Autre', icon: 'package', isFallback: true });
    await expect(
      tmp.db
        .insert(categories)
        .values({ householdId: a, name: 'Autre bis', icon: 'package', isFallback: true }),
    ).rejects.toThrow();
  });

  it('refuses a data row without a household (no context, no default)', async () => {
    await expect(
      tmp.pool.query(`INSERT INTO categories (name, icon) VALUES ('Sans foyer', 'package')`),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('deletes the data of a household with it, and refuses while it has accounts', async () => {
    const a = await seedBase(await household('A'));
    await tmp.db.insert(stockMovements).values(movement(a, 1));
    await expect(
      tmp.pool.query('DELETE FROM households WHERE id = $1', [a.householdId]),
    ).rejects.toMatchObject({ code: '23503' });
    // Accounts are never deleted: they move to another household first (admin console).
    const other = await household('Ailleurs');
    await tmp.pool.query('UPDATE users SET household_id = $1 WHERE household_id = $2', [
      other,
      a.householdId,
    ]);
    await tmp.pool.query('DELETE FROM households WHERE id = $1', [a.householdId]);
    for (const table of ['locations', 'shelves', 'categories', 'products', 'stock_movements']) {
      const { rows } = await tmp.pool.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, table).toBe(0);
    }
  });
});
