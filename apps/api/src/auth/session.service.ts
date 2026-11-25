import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { DB, type Database, type Executor } from '../database/database.module';
import { sessions, users } from '../database/schema';
import { SESSION_REFRESH_AFTER_MS, SESSION_TTL_MS } from './auth.constants';
import type { RequestUser } from './auth.types';

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export interface ValidatedSession {
  user: RequestUser;
  /** Set when the session was just extended and the cookie must be renewed. */
  refreshedExpiresAt?: Date;
}

/**
 * Database id of a session: HMAC-SHA256 of the opaque token, keyed with SESSION_SECRET.
 * The token itself is never stored; changing the secret invalidates every session.
 */
export function sessionId(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'SESSION_SECRET'>,
  ) {}

  private idOf(token: string): string {
    return sessionId(this.config.SESSION_SECRET, token);
  }

  async create(
    userId: number,
    userAgent: string | undefined,
    executor: Executor = this.db,
  ): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await executor.insert(sessions).values({
      id: this.idOf(token),
      userId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      userAgent: userAgent?.slice(0, 255) ?? null,
    });
    return { token, expiresAt };
  }

  async validate(token: string): Promise<ValidatedSession | null> {
    const id = this.idOf(token);
    const [row] = await this.db
      .select({
        expiresAt: sessions.expiresAt,
        lastSeenAt: sessions.lastSeenAt,
        userId: users.id,
        username: users.username,
        role: users.role,
        householdId: users.householdId,
        disabledAt: users.disabledAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id));
    if (!row) return null;

    const now = this.clock.now();
    if (row.expiresAt <= now || row.disabledAt !== null) {
      await this.db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }

    const user: RequestUser = {
      id: row.userId,
      username: row.username,
      role: row.role as RequestUser['role'],
      householdId: row.householdId,
      sessionId: id,
    };
    if (now.getTime() - row.lastSeenAt.getTime() > SESSION_REFRESH_AFTER_MS) {
      const refreshedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await this.db
        .update(sessions)
        .set({ expiresAt: refreshedExpiresAt, lastSeenAt: now })
        .where(eq(sessions.id, id));
      return { user, refreshedExpiresAt };
    }
    return { user };
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /** Revokes every session of a user, optionally keeping one. */
  async deleteForUser(
    userId: number,
    exceptSessionId?: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .delete(sessions)
      .where(
        exceptSessionId === undefined
          ? eq(sessions.userId, userId)
          : and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)),
      );
  }
}
