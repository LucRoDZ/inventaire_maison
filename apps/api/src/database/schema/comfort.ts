import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { products } from './catalog';
import { householdColumn } from './households';

/** One row per household (created on first write); absent: the defaults of `@inventaire/shared`. */
export const settings = pgTable(
  'settings',
  {
    householdId: householdColumn().primaryKey(),
    /** Days (inclusive) before the expiry date from which a line is "soon". */
    expiryAlertDays: integer('expiry_alert_days').notNull().default(3),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('settings_expiry_alert_days_check', sql`${t.expiryAlertDays} between 0 and 30`)],
);

/** The shopping list of a household: a catalogue product or a free label. */
export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    productId: integer('product_id'),
    label: text(),
    quantity: integer().notNull().default(1),
    amount: numeric({ precision: 10, scale: 3 }),
    unit: text(),
    checked: boolean().notNull().default(false),
    /** `auto`: added because the stock went below `products.min_quantity`. */
    origin: text().notNull().default('manual'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
  },
  (t) => [
    index('shopping_items_household_idx').on(t.householdId),
    // Never two open lines for the same product.
    uniqueIndex('shopping_items_open_product_key')
      .on(t.householdId, t.productId)
      .where(sql`${t.productId} is not null and not ${t.checked}`),
    foreignKey({
      name: 'shopping_items_product_household_fk',
      columns: [t.productId, t.householdId],
      foreignColumns: [products.id, products.householdId],
    }),
    check('shopping_items_target_check', sql`${t.productId} is not null or ${t.label} is not null`),
    check(
      'shopping_items_label_check',
      sql`${t.label} is null or char_length(${t.label}) between 1 and 120`,
    ),
    check('shopping_items_quantity_check', sql`${t.quantity} between 1 and 999`),
    check('shopping_items_amount_check', sql`${t.amount} is null or ${t.amount} > 0`),
    check(
      'shopping_items_unit_check',
      sql`${t.unit} is null or ${t.unit} in ('g', 'kg', 'ml', 'cl', 'l', 'unit')`,
    ),
    check('shopping_items_origin_check', sql`${t.origin} in ('manual', 'auto')`),
  ],
);

/**
 * One Web Push subscription per device. Belongs to an account and to its household: the daily
 * summary only uses a subscription whose account is enabled and still in that household.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    householdId: householdColumn(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [
    index('push_subscriptions_household_idx').on(t.householdId),
    index('push_subscriptions_user_idx').on(t.userId),
    // Per household (row-level security hides the others); the web app unsubscribes on sign-out.
    uniqueIndex('push_subscriptions_household_endpoint_key').on(t.householdId, t.endpoint),
  ],
);
