import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '@inventaire/shared';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';
import { LOGIN_FAILURE_MESSAGE, WRONG_CURRENT_PASSWORD_MESSAGE } from './auth.constants';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';
import { lockUser } from './user-lock';
import { SessionService, type CreatedSession } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  /** Same answer, and a dummy hash, for an unknown username, a disabled account or a wrong password. */
  async login(
    username: string,
    password: string,
    userAgent: string | undefined,
    ip: string,
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
    // Counted as a failure from here on, and forgotten only once the password is right.
    await this.throttle.reserve(username, ip);

    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.username})`, LoginThrottleService.key(username)));

    if (!row || row.disabledAt !== null) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }
    if (!(await this.passwords.verify(row.passwordHash, password))) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }
    // Under the user's lock, the password checked above must still be the current one: a password
    // change (or a deactivation) that finished meanwhile would otherwise leave this new session alive.
    const session = await this.db.transaction(async (tx) => {
      await lockUser(tx, row.id);
      const [current] = await tx
        .select({ passwordHash: users.passwordHash, disabledAt: users.disabledAt })
        .from(users)
        .where(eq(users.id, row.id));
      if (!current || current.passwordHash !== row.passwordHash || current.disabledAt !== null) {
        throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
      }
      return this.sessions.create(row.id, userAgent, tx);
    });
    await this.throttle.clear(username, ip);
    return {
      user: {
        id: row.id,
        username: row.username,
        role: row.role as AuthUser['role'],
        dataScope: this.sessions.dataScope(row.id, row.householdId),
      },
      session,
    };
  }

  /**
   * Changes the password of a user and revokes all of their other sessions. A wrong current
   * password counts as a failed login for the (username, IP) pair.
   */
  async changePassword(
    user: { id: number; username: string; sessionId: string },
    ip: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.throttle.reserve(user.username, ip);
    // One transaction under the user's lock: the new hash and the revocation of the other sessions
    // are written together, and no login can slip a session in between.
    await this.db.transaction(async (tx) => {
      await lockUser(tx, user.id);
      const [row] = await tx.select().from(users).where(eq(users.id, user.id));
      if (!row || !(await this.passwords.verify(row.passwordHash, currentPassword))) {
        throw new ForbiddenException(WRONG_CURRENT_PASSWORD_MESSAGE);
      }
      const passwordHash = await this.passwords.hash(newPassword);
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      await this.sessions.deleteForUser(user.id, user.sessionId, tx);
    });
    await this.throttle.clear(user.username, ip);
  }
}
