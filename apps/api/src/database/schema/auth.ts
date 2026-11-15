import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: text().notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text().notNull().default('member'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Usernames are unique whatever their case.
    uniqueIndex('users_username_lower_key').on(sql`lower(${t.username})`),
    check('users_role_check', sql`${t.role} in ('admin', 'member')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /** HMAC-SHA256 of the session token, keyed with SESSION_SECRET. */
    id: text().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: text().notNull(),
    ip: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_attempts_lookup_idx').on(t.username, t.ip, t.createdAt)],
);
