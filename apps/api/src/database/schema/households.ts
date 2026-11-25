import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * The unit of isolation (decision D1): every account belongs to exactly one household, and every
 * data row carries the household it belongs to. Not row-level secured: login and the admin console
 * read it before any household context exists.
 */
export const households = pgTable(
  'households',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('households_name_lower_key').on(sql`lower(${t.name})`),
    check('households_name_length_check', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

/**
 * `household_id` of a data table. The default reads the household of the current transaction
 * (`app.household_id`, set by TenantDb): without one it is null and the insert fails on NOT NULL,
 * so a row can never land in a household by accident. Services still set it explicitly.
 */
export const householdColumn = () =>
  integer('household_id')
    .notNull()
    .default(sql`NULLIF(current_setting('app.household_id', true), '')::int`)
    .references(() => households.id, { onDelete: 'cascade' });
