import type { INestApplication } from '@nestjs/common';
import type { UserRole } from '@inventaire/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Response } from 'supertest';
import { PasswordService } from '../src/auth/password.service';
import type { Clock } from '../src/common/clock';
import { applyHouseholdTemplate } from '../src/database/seed/household-template';
import { users } from '../src/database/schema';
import { TenantDb } from '../src/database/tenant-db';

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-06-01T10:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Origin header accepted by the CSRF guard in tests (default PUBLIC_ORIGIN). */
export const ORIGIN = 'http://localhost:3000';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** The household every test account and fixture belongs to unless told otherwise. */
export const HOUSEHOLD = 1;

let owner: Pool | null = null;

/**
 * Owner connection (DATABASE_MIGRATION_URL, a superuser in tests): fixtures and checks that must
 * not go through the application role nor row-level security. Its connections default to the
 * test household, so a fixture row without `household_id` lands there.
 */
export function ownerPool(): Pool {
  owner ??= new Pool({
    connectionString: process.env['DATABASE_MIGRATION_URL'],
    options: `-c app.household_id=${HOUSEHOLD}`,
  });
  return owner;
}

export function ownerDb(): NodePgDatabase {
  return drizzle(ownerPool());
}

/** Closed by the setup file after each test file. */
export async function closeOwnerPool(): Promise<void> {
  const pool = owner;
  owner = null;
  await pool?.end();
}

async function ensureHousehold(id: number, name: string): Promise<void> {
  await ownerPool().query(
    `INSERT INTO households (id, name) OVERRIDING SYSTEM VALUE VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, name],
  );
  await ownerPool().query(
    `SELECT setval(pg_get_serial_sequence('households', 'id'), greatest((SELECT max(id) FROM households), 1))`,
  );
}

/** Empties the tables touched by authentication tests; household 1 exists afterwards. */
export async function resetAuth(): Promise<void> {
  await ownerPool().query('TRUNCATE sessions, login_attempts, users RESTART IDENTITY CASCADE');
  await ensureHousehold(HOUSEHOLD, 'Famille');
}

/** Empties every table, households included, then recreates the empty household 1. */
export async function resetAll(): Promise<void> {
  await ownerPool().query(
    `TRUNCATE stock_movements, stock_items, products, off_category_map, categories, shelves,
      locations, sessions, login_attempts, users, households RESTART IDENTITY CASCADE`,
  );
  await ensureHousehold(HOUSEHOLD, 'Famille');
}

/** Copies the model (categories, mappings, furniture) into a household, through the application. */
export async function seedHousehold(app: INestApplication, householdId = HOUSEHOLD): Promise<void> {
  await app.get(TenantDb).forHousehold(householdId, (tx, id) => applyHouseholdTemplate(tx, id));
}

/** Creates another household (owner connection), with a copy of the model unless `empty`. */
export async function createHousehold(
  app: INestApplication,
  name: string,
  { empty = false }: { empty?: boolean } = {},
): Promise<number> {
  const { rows } = await ownerPool().query<{ id: number }>(
    'INSERT INTO households (name) VALUES ($1) RETURNING id',
    [name],
  );
  const id = rows[0]!.id;
  if (!empty) await seedHousehold(app, id);
  return id;
}

export async function createUser(
  app: INestApplication,
  input: {
    username: string;
    password: string;
    role?: UserRole;
    disabled?: boolean;
    householdId?: number;
  },
): Promise<number> {
  const passwordHash = await app.get(PasswordService).hash(input.password);
  const [row] = await ownerDb()
    .insert(users)
    .values({
      username: input.username,
      passwordHash,
      role: input.role ?? 'member',
      disabledAt: input.disabled ? new Date() : null,
      householdId: input.householdId ?? HOUSEHOLD,
    })
    .returning({ id: users.id });
  return row!.id;
}

/** Returns the raw Set-Cookie line for a cookie name, or undefined. */
export function setCookieLine(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((line) => line.startsWith(`${name}=`));
}

export function cookieValue(res: Response, name: string): string | undefined {
  return setCookieLine(res, name)
    ?.split(';')[0]
    ?.slice(name.length + 1);
}
