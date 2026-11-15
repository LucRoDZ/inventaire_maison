import type { INestApplication } from '@nestjs/common';
import type { UserRole } from '@inventaire/shared';
import type { Response } from 'supertest';
import { PasswordService } from '../src/auth/password.service';
import type { Clock } from '../src/common/clock';
import { DB, PG_POOL, type Database } from '../src/database/database.module';
import { users } from '../src/database/schema';
import type { Pool } from 'pg';

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

/** Empties the tables touched by authentication tests. */
export async function resetAuth(app: INestApplication): Promise<void> {
  await app
    .get<Pool>(PG_POOL)
    .query('TRUNCATE sessions, login_attempts, users RESTART IDENTITY CASCADE');
}

export async function createUser(
  app: INestApplication,
  input: { username: string; password: string; role?: UserRole; disabled?: boolean },
): Promise<number> {
  const passwordHash = await app.get(PasswordService).hash(input.password);
  const [row] = await app
    .get<Database>(DB)
    .insert(users)
    .values({
      username: input.username,
      passwordHash,
      role: input.role ?? 'member',
      disabledAt: input.disabled ? new Date() : null,
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
