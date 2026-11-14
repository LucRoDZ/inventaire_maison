import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { locations } from './places';

export const categories = pgTable(
  'categories',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    icon: text().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isFallback: boolean('is_fallback').notNull().default(false),
  },
  (t) => [
    uniqueIndex('categories_name_lower_key').on(sql`lower(${t.name})`),
    // At most one fallback category ("Autre").
    uniqueIndex('categories_single_fallback_key')
      .on(t.isFallback)
      .where(sql`${t.isFallback}`),
  ],
);

export const offCategoryMap = pgTable('off_category_map', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  offTag: text('off_tag').notNull().unique(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
});

export const products = pgTable(
  'products',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Canonical EAN-13 or EAN-8; null for products without a barcode. */
    barcode: text().unique(),
    name: text().notNull(),
    brand: text(),
    sizeLabel: text('size_label'),
    imagePath: text('image_path'),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    defaultLocationId: integer('default_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
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
    // The unique constraint on barcode already provides the barcode index.
    index('products_search_text_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('products_category_id_idx').on(t.categoryId),
    check('products_source_check', sql`${t.source} in ('off', 'manual')`),
  ],
);
