import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, lt, min } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { DB, type Database } from '../database/database.module';
import { loginAttempts } from '../database/schema';

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Trop de tentatives, réessayez dans 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** Blocks a (username, IP) pair after 5 failures within 15 minutes. */
@Injectable()
export class LoginThrottleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  static key(username: string): string {
    return username.trim().toLowerCase();
  }

  /** Throws TooManyAttemptsException when the pair is blocked, even for a correct password. */
  async assertAllowed(username: string, ip: string): Promise<void> {
    const since = new Date(this.clock.now().getTime() - FAILURE_WINDOW_MS);
    const [row] = await this.db
      .select({ n: count(), oldest: min(loginAttempts.createdAt) })
      .from(loginAttempts)
      .where(this.pairSince(username, ip, since));
    if (!row || row.n < MAX_FAILURES || !row.oldest) return;
    const unblockAt = row.oldest.getTime() + FAILURE_WINDOW_MS;
    const seconds = Math.max(1, Math.ceil((unblockAt - this.clock.now().getTime()) / 1000));
    throw new TooManyAttemptsException(seconds);
  }

  async recordFailure(username: string, ip: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .insert(loginAttempts)
      .values({ username: LoginThrottleService.key(username), ip, createdAt: now });
    await this.purge();
  }

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

  private pairSince(username: string, ip: string, since: Date) {
    return and(
      eq(loginAttempts.username, LoginThrottleService.key(username)),
      eq(loginAttempts.ip, ip),
      gt(loginAttempts.createdAt, since),
    );
  }
}
