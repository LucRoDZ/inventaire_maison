import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '@inventaire/shared';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';
import { LOGIN_FAILURE_MESSAGE, WRONG_CURRENT_PASSWORD_MESSAGE } from './auth.constants';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';
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
    await this.throttle.clear(username, ip);

    const session = await this.sessions.create(row.id, userAgent);
    return {
      user: { id: row.id, username: row.username, role: row.role as AuthUser['role'] },
      session,
    };
  }

  /** Changes the password of a user and revokes all of their other sessions. */
  async changePassword(
    userId: number,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!row || !(await this.passwords.verify(row.passwordHash, currentPassword))) {
      throw new ForbiddenException(WRONG_CURRENT_PASSWORD_MESSAGE);
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await this.sessions.deleteForUser(userId, currentSessionId);
  }
}
