import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '@inventaire/shared';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { users } from '../database/schema';
import { LOGIN_FAILURE_MESSAGE } from './auth.constants';
import { PasswordService } from './password.service';
import { SessionService, type CreatedSession } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /** Same answer, and a dummy hash, for an unknown username, a disabled account or a wrong password. */
  async login(
    username: string,
    password: string,
    userAgent: string | undefined,
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.username})`, username.trim().toLowerCase()));

    if (!row || row.disabledAt !== null) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }
    if (!(await this.passwords.verify(row.passwordHash, password))) {
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    const session = await this.sessions.create(row.id, userAgent);
    return {
      user: { id: row.id, username: row.username, role: row.role as AuthUser['role'] },
      session,
    };
  }
}
