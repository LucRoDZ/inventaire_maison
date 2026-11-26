import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { householdColumn } from './households';

/**
 * Offline operations already applied, by the key the device generated (Phase 4). A replayed key
 * returns the stored result without touching the stock again. Unique per household: two households
 * never collide, and row-level security hides the keys of the others. Purged after 14 days.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    householdId: householdColumn(),
    key: text().notNull(),
    /** Opaque id of the device that sent the operation. */
    deviceId: text('device_id').notNull(),
    /** Summary of the `SyncResult` returned the first time. */
    result: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idempotency_keys_household_key').on(t.householdId, t.key),
    index('idempotency_keys_created_at_idx').on(t.createdAt),
    check('idempotency_keys_key_check', sql`char_length(${t.key}) between 8 and 100`),
    check('idempotency_keys_device_check', sql`char_length(${t.deviceId}) between 8 and 100`),
  ],
);
