import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { DB, type Database } from '../database/database.module';
import { loginAttempts } from '../database/schema';

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** First key of the PostgreSQL advisory locks taken by the login throttle. */
const LOCK_NAMESPACE = 1;

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Trop de tentatives, réessayez dans 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Blocks a (username, IP) pair after 5 failures within 15 minutes.
 *
 * An attempt is reserved (written) before the password is checked, under an advisory lock on the
 * pair: concurrent requests are serialised, so no more than 5 passwords are ever tried per window.
 * A successful login then clears the attempts of the pair.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  static key(username: string): string {
    return username.trim().toLowerCase();
  }

  /**
   * Throws TooManyAttemptsException when the pair is blocked, even for a correct password;
   * otherwise records one attempt, counted as a failure until clear() is called.
   */
  async reserve(username: string, ip: string): Promise<void> {
    const key = LoginThrottleService.key(username);
    const now = this.clock.now();
    // A block can only still be running if it started within the window, from failures that are
    // themselves at most one window older.
    const since = new Date(now.getTime() - 2 * FAILURE_WINDOW_MS);
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${`${key}|${ip}`}))`,
      );
      const rows = await tx
        .select({ at: loginAttempts.createdAt })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.username, key),
            eq(loginAttempts.ip, ip),
            gt(loginAttempts.createdAt, since),
          ),
        )
        .orderBy(asc(loginAttempts.createdAt));
      const blockedUntil = LoginThrottleService.blockedUntil(rows.map((row) => row.at.getTime()));
      if (blockedUntil > now.getTime()) {
        throw new TooManyAttemptsException(
          Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1000)),
        );
      }
      await tx.insert(loginAttempts).values({ username: key, ip, createdAt: now });
    });
    await this.purge();
  }

  /**
   * End of the block, in ms (0 if none): 15 minutes after the failure that completes
   * 5 failures within 15 minutes. `times` is sorted in ascending order.
   */
  static blockedUntil(times: readonly number[]): number {
    let until = 0;
    for (let i = MAX_FAILURES - 1; i < times.length; i++) {
      const last = times[i]!;
      if (last - times[i - (MAX_FAILURES - 1)]! <= FAILURE_WINDOW_MS) {
        until = Math.max(until, last + FAILURE_WINDOW_MS);
      }
    }
    return until;
  }

  /** Forgets the attempts of the pair, after a successful login. */
  async clear(username: string, ip: string): Promise<void> {
    await this.db
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, LoginThrottleService.key(username)),
          eq(loginAttempts.ip, ip),
        ),
      );
  }

  /** Removes attempts older than 24 hours. */
  async purge(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - RETENTION_MS);
    await this.db.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
  }
}
