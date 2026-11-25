import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { products } from './catalog';
import { householdColumn } from './households';
import { locations, shelves } from './places';

export const stockItems = pgTable(
  'stock_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    productId: integer('product_id').notNull(),
    locationId: integer('location_id').notNull(),
    /** Null means the "Non rangé" tray of the location. Must be a shelf of location_id. */
    shelfId: integer('shelf_id'),
    quantity: integer().notNull(),
    expiryDate: date('expiry_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('stock_items_identity_key')
      .on(t.productId, t.locationId, t.shelfId, t.expiryDate)
      .nullsNotDistinct(),
    check('stock_items_quantity_check', sql`${t.quantity} > 0`),
    // Product and location of the same household; the shelf of the line's location.
    foreignKey({
      name: 'stock_items_product_household_fk',
      columns: [t.productId, t.householdId],
      foreignColumns: [products.id, products.householdId],
    }),
    foreignKey({
      name: 'stock_items_location_household_fk',
      columns: [t.locationId, t.householdId],
      foreignColumns: [locations.id, locations.householdId],
    }),
    // The shelf must belong to the location of the line (not checked when shelf_id is null).
    foreignKey({
      name: 'stock_items_shelf_location_fk',
      columns: [t.shelfId, t.locationId],
      foreignColumns: [shelves.id, shelves.locationId],
    }),
    index('stock_items_household_idx').on(t.householdId),
    index('stock_items_location_shelf_idx').on(t.locationId, t.shelfId),
    index('stock_items_expiry_date_idx').on(t.expiryDate),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    productId: integer('product_id').notNull(),
    /**
     * Plain integers on purpose: the journal is never modified, so it must survive the deletion of
     * a shelf or of a whole piece of furniture. The names below are a snapshot for the history.
     */
    locationId: integer('location_id').notNull(),
    shelfId: integer('shelf_id'),
    /** Name of the location when the movement was written. */
    locationName: text('location_name').notNull(),
    /** Name of the shelf when the movement was written; null for the "Non rangé" tray. */
    shelfName: text('shelf_name'),
    expiryDate: date('expiry_date', { mode: 'string' }),
    delta: integer().notNull(),
    reason: text().notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('stock_movements_delta_check', sql`${t.delta} <> 0`),
    check(
      'stock_movements_reason_check',
      sql`${t.reason} in ('scan_add', 'scan_remove', 'manual', 'move', 'correction')`,
    ),
    foreignKey({
      name: 'stock_movements_product_household_fk',
      columns: [t.productId, t.householdId],
      foreignColumns: [products.id, products.householdId],
    }),
    index('stock_movements_household_idx').on(t.householdId),
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
  ],
);
