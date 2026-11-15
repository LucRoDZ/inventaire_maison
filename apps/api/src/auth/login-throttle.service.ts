import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { DB, type Database } from '../database/database.module';
import { loginAttempts } from '../database/schema';

export const MAX_FAILURES = 5;
/** Failures per username within the window, whatever the IP: stops a spread-out attack on one account. */
export const MAX_FAILURES_PER_USERNAME = 30;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** First key of the PostgreSQL advisory locks taken by the login throttle. */
const LOCK_NAMESPACE = 1;

/**
 * The address the throttle keys on. IPv4-mapped IPv6 addresses count as IPv4, and any other IPv6
 * address is reduced to its /64 prefix: one subscriber holds a whole /64, so keying on the full
 * address would give an attacker 2^64 fresh identities.
 */
export function throttleIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(':')) return ip;
  const zone = ip.indexOf('%');
  const bare = zone === -1 ? ip : ip.slice(0, zone);
  const [head = '', tail = ''] = bare.split('::', 2);
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = bare.includes('::') && tail !== '' ? tail.split(':') : [];
  const missing = bare.includes('::') ? 8 - headGroups.length - tailGroups.length : 0;
  const groups = [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
  if (groups.length < 4) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Trop de tentatives, réessayez dans 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Blocks a (username, IP) pair after 5 failures within 15 minutes, and a username after 30
 * failures within 15 minutes whatever the IPs (IPv6 addresses count by /64).
 *
 * An attempt is reserved (written) before the password is checked, under an advisory lock on the
 * username: concurrent requests are serialised, so no more than 5 passwords per pair (30 per
 * username) are ever tried per window. A successful login then clears the attempts of the pair.
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
  async reserve(username: string, rawIp: string): Promise<void> {
    const key = LoginThrottleService.key(username);
    const ip = throttleIp(rawIp);
    const now = this.clock.now();
    // A block can only still be running if it started within the window, from failures that are
    // themselves at most one window older.
    const since = new Date(now.getTime() - 2 * FAILURE_WINDOW_MS);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${key}))`);
      const rows = await tx
        .select({ at: loginAttempts.createdAt, ip: loginAttempts.ip })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.username, key), gt(loginAttempts.createdAt, since)))
        .orderBy(asc(loginAttempts.createdAt));
      const pairUntil = LoginThrottleService.blockedUntil(
        rows.filter((row) => row.ip === ip).map((row) => row.at.getTime()),
      );
      const usernameUntil = LoginThrottleService.blockedUntil(
        rows.map((row) => row.at.getTime()),
        MAX_FAILURES_PER_USERNAME,
      );
      const blockedUntil = Math.max(pairUntil, usernameUntil);
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
   * `max` failures within 15 minutes. `times` is sorted in ascending order.
   */
  static blockedUntil(times: readonly number[], max: number = MAX_FAILURES): number {
    let until = 0;
    for (let i = max - 1; i < times.length; i++) {
      const last = times[i]!;
      if (last - times[i - (max - 1)]! <= FAILURE_WINDOW_MS) {
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
          eq(loginAttempts.ip, throttleIp(ip)),
        ),
      );
  }

  /** Removes attempts older than 24 hours. */
  async purge(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - RETENTION_MS);
    await this.db.delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
  }
}
