import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { householdColumn } from './households';

export const locations = pgTable(
  'locations',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
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
    index('locations_household_idx').on(t.householdId),
    // Target of the composite foreign keys: a child can only point at a location of its household.
    unique('locations_id_household_key').on(t.id, t.householdId),
    // D6: one name per household, whatever its case.
    uniqueIndex('locations_household_name_key').on(t.householdId, sql`lower(${t.name})`),
  ],
);

export const shelves = pgTable(
  'shelves',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    locationId: integer('location_id').notNull(),
    name: text().notNull(),
    kind: text().notNull().default('plain'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('shelves_location_id_idx').on(t.locationId),
    index('shelves_household_idx').on(t.householdId),
    // Target of the composite foreign key of stock_items: a shelf belongs to one location.
    unique('shelves_id_location_key').on(t.id, t.locationId),
    foreignKey({
      name: 'shelves_location_household_fk',
      columns: [t.locationId, t.householdId],
      foreignColumns: [locations.id, locations.householdId],
    }).onDelete('cascade'),
    check('shelves_kind_check', sql`${t.kind} in ('rack', 'plain')`),
  ],
);
