import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../../../test/temp-database';
import {
  categories,
  locations,
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
    sql`TRUNCATE stock_movements, stock_items, products, off_category_map, categories, shelves, locations, sessions, users RESTART IDENTITY CASCADE`,
  );
});

async function seedBase() {
  const [category] = await tmp.db
    .insert(categories)
    .values({ name: 'Boissons', icon: 'cup-soda' })
    .returning();
  const [location] = await tmp.db
    .insert(locations)
    .values({ name: 'Frigo', kind: 'fridge', icon: 'refrigerator' })
    .returning();
  const [shelf] = await tmp.db
    .insert(shelves)
    .values({ locationId: location!.id, name: 'Étagère 1' })
    .returning();
  const [product] = await tmp.db
    .insert(products)
    .values({ name: 'Lait', categoryId: category!.id })
    .returning();
  const [user] = await tmp.db
    .insert(users)
    .values({ username: 'lucas', passwordHash: 'x', role: 'admin' })
    .returning();
  return {
    category: category!,
    location: location!,
    shelf: shelf!,
    product: product!,
    user: user!,
  };
}

describe('migration', () => {
  it('creates every table and the pg_trgm extension on an empty database', async () => {
    const tables = await tmp.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
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
        'products_barcode_unique',
      ]),
    );
  });
});

describe('constraints', () => {
  it('refuses two identical stock lines when shelf and expiry date are null', async () => {
    const { product, location } = await seedBase();
    const line = { productId: product.id, locationId: location.id, quantity: 1 };
    await tmp.db.insert(stockItems).values(line);
    await expect(tmp.db.insert(stockItems).values(line)).rejects.toThrow();
  });

  it('accepts the same product on different expiry dates', async () => {
    const { product, location } = await seedBase();
    const line = { productId: product.id, locationId: location.id, quantity: 1 };
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: '2026-12-01' });
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: '2026-12-02' });
    await tmp.db.insert(stockItems).values({ ...line, expiryDate: null });
  });

  it('refuses a quantity of 0', async () => {
    const { product, location } = await seedBase();
    await expect(
      tmp.db
        .insert(stockItems)
        .values({ productId: product.id, locationId: location.id, quantity: 0 }),
    ).rejects.toThrow();
  });

  it('refuses a movement with a delta of 0', async () => {
    const { product, location, user } = await seedBase();
    await expect(
      tmp.db.insert(stockMovements).values({
        productId: product.id,
        locationId: location.id,
        delta: 0,
        reason: 'manual',
        userId: user.id,
      }),
    ).rejects.toThrow();
  });

  it('accepts two products without a barcode but refuses a duplicate barcode', async () => {
    const { category } = await seedBase();
    await tmp.db.insert(products).values({ name: 'Tomates', categoryId: category.id });
    await tmp.db.insert(products).values({ name: 'Carottes', categoryId: category.id });
    await tmp.db
      .insert(products)
      .values({ name: 'A', categoryId: category.id, barcode: '3017620422003' });
    await expect(
      tmp.db
        .insert(products)
        .values({ name: 'B', categoryId: category.id, barcode: '3017620422003' }),
    ).rejects.toThrow();
  });

  it('refuses a duplicate username whatever its case', async () => {
    await tmp.db.insert(users).values({ username: 'lucas', passwordHash: 'x' });
    await expect(
      tmp.db.insert(users).values({ username: 'Lucas', passwordHash: 'x' }),
    ).rejects.toThrow();
  });

  it('refuses an unknown role and an unknown movement reason', async () => {
    await expect(
      tmp.db.insert(users).values({ username: 'bob', passwordHash: 'x', role: 'root' }),
    ).rejects.toThrow();
    const { product, location, user } = await seedBase();
    await expect(
      tmp.db.insert(stockMovements).values({
        productId: product.id,
        locationId: location.id,
        delta: 1,
        reason: 'magic',
        userId: user.id,
      }),
    ).rejects.toThrow();
  });

  it('allows a single fallback category', async () => {
    await tmp.db.insert(categories).values({ name: 'Autre', icon: 'package', isFallback: true });
    await expect(
      tmp.db.insert(categories).values({ name: 'Autre bis', icon: 'package', isFallback: true }),
    ).rejects.toThrow();
  });
});
