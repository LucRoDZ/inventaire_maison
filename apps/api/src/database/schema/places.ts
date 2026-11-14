import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const locations = pgTable(
  'locations',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    kind: text().notNull().default('other'),
    icon: text().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    check(
      'locations_kind_check',
      sql`${t.kind} in ('pantry', 'fridge', 'freezer', 'cellar', 'other')`,
    ),
  ],
);

export const shelves = pgTable(
  'shelves',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    kind: text().notNull().default('plain'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('shelves_location_id_idx').on(t.locationId),
    check('shelves_kind_check', sql`${t.kind} in ('rack', 'plain')`),
  ],
);
