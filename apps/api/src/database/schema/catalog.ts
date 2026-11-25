import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { householdColumn } from './households';
import { locations } from './places';

/** Categories belong to a household (D5): each one adapts the copy of the model it received. */
export const categories = pgTable(
  'categories',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    name: text().notNull(),
    icon: text().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isFallback: boolean('is_fallback').notNull().default(false),
  },
  (t) => [
    index('categories_household_idx').on(t.householdId),
    unique('categories_id_household_key').on(t.id, t.householdId),
    uniqueIndex('categories_household_name_key').on(t.householdId, sql`lower(${t.name})`),
    // At most one fallback category ("Autre") per household.
    uniqueIndex('categories_household_fallback_key')
      .on(t.householdId)
      .where(sql`${t.isFallback}`),
  ],
);

export const offCategoryMap = pgTable(
  'off_category_map',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    offTag: text('off_tag').notNull(),
    categoryId: integer('category_id').notNull(),
  },
  (t) => [
    index('off_category_map_household_idx').on(t.householdId),
    unique('off_category_map_household_tag_key').on(t.householdId, t.offTag),
    foreignKey({
      name: 'off_category_map_category_household_fk',
      columns: [t.categoryId, t.householdId],
      foreignColumns: [categories.id, categories.householdId],
    }).onDelete('cascade'),
  ],
);

export const products = pgTable(
  'products',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    /** Canonical EAN-13 or EAN-8; null for products without a barcode. Unique per household (D5). */
    barcode: text(),
    name: text().notNull(),
    brand: text(),
    sizeLabel: text('size_label'),
    imagePath: text('image_path'),
    categoryId: integer('category_id').notNull(),
    /**
     * The migration declares `ON DELETE SET NULL (default_location_id)`: deleting the location
     * clears this column only (Drizzle cannot express the column list).
     */
    defaultLocationId: integer('default_location_id'),
    source: text().notNull().default('manual'),
    categoryGuessed: boolean('category_guessed').notNull().default(false),
    offPayload: jsonb('off_payload'),
    /** Lowercase name and brand without diacritics, computed by the API. */
    searchText: text('search_text').notNull().default(''),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_household_idx').on(t.householdId),
    unique('products_id_household_key').on(t.id, t.householdId),
    // Also the barcode index of the household.
    unique('products_household_barcode_key').on(t.householdId, t.barcode),
    index('products_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('products_category_id_idx').on(t.categoryId),
    foreignKey({
      name: 'products_category_household_fk',
      columns: [t.categoryId, t.householdId],
      foreignColumns: [categories.id, categories.householdId],
    }),
    foreignKey({
      name: 'products_default_location_household_fk',
      columns: [t.defaultLocationId, t.householdId],
      foreignColumns: [locations.id, locations.householdId],
    }),
    check('products_source_check', sql`${t.source} in ('off', 'manual')`),
  ],
);
