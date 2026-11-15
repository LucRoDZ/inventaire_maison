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
import { locations, shelves } from './places';

export const stockItems = pgTable(
  'stock_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id),
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
    // The shelf must belong to the location of the line (not checked when shelf_id is null).
    foreignKey({
      name: 'stock_items_shelf_location_fk',
      columns: [t.shelfId, t.locationId],
      foreignColumns: [shelves.id, shelves.locationId],
    }),
    index('stock_items_location_shelf_idx').on(t.locationId, t.shelfId),
    index('stock_items_expiry_date_idx').on(t.expiryDate),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id),
    /** Plain integer on purpose: the journal is never modified, so it must survive the deletion of a shelf. */
    shelfId: integer('shelf_id'),
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
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
  ],
);
