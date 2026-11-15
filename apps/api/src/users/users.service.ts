import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserDto, UserRole } from '@inventaire/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { lockUser } from '../auth/user-lock';
import { DB, type Database, type Transaction } from '../database/database.module';
import { users } from '../database/schema';

type UserRow = typeof users.$inferSelect;

export interface UserPatch {
  role?: UserRole;
  password?: string;
  /** Only `false` is accepted: reactivation. Deactivation is `DELETE`. */
  disabled?: false;
}

const USERNAME_TAKEN = 'Ce pseudo existe déjà (même si le compte est désactivé).';
const LAST_ADMIN = 'Impossible : ce compte est le dernier administrateur actif.';
const SELF = 'Impossible sur votre propre compte.';

function toDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    disabled: row.disabledAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async list(): Promise<UserDto[]> {
    const rows = await this.db.select().from(users).orderBy(asc(users.username), asc(users.id));
    return rows.map(toDto);
  }

  async create(input: { username: string; password: string; role: UserRole }): Promise<UserDto> {
    const username = input.username.toLowerCase();
    const [taken] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.username})`, username));
    if (taken) throw new ConflictException(USERNAME_TAKEN);
    const passwordHash = await this.passwords.hash(input.password);
    const inserted = await this.db
      .insert(users)
      .values({ username, passwordHash, role: input.role })
      .onConflictDoNothing()
      .returning();
    // A concurrent creation of the same pseudo hit the unique index.
    if (inserted[0] === undefined) throw new ConflictException(USERNAME_TAKEN);
    return toDto(inserted[0]);
  }

  async update(actorId: number, id: number, patch: UserPatch): Promise<UserDto> {
    if (id === actorId && (patch.role !== undefined || patch.password !== undefined)) {
      throw new ConflictException(
        patch.password !== undefined && patch.role === undefined
          ? 'Changez votre mot de passe depuis la page Compte.'
          : SELF,
      );
    }
    const passwordHash =
      patch.password === undefined ? undefined : await this.passwords.hash(patch.password);
    return this.db.transaction(async (tx) => {
      await this.lockAdmins(tx, id);
      const row = await this.get(tx, id);
      const set: Partial<typeof users.$inferInsert> = {};
      if (patch.role !== undefined) {
        if (patch.role !== row.role && row.role === 'admin' && row.disabledAt === null) {
          await this.assertNotLastAdmin(tx, id);
        }
        set.role = patch.role;
      }
      if (passwordHash !== undefined) set.passwordHash = passwordHash;
      if (patch.disabled === false) set.disabledAt = null;
      let updated = row;
      if (Object.keys(set).length > 0) {
        const [changed] = await tx.update(users).set(set).where(eq(users.id, id)).returning();
        updated = changed ?? row;
      }
      // A new password cuts every open session of the member.
      if (passwordHash !== undefined) await this.sessions.deleteForUser(id, undefined, tx);
      return toDto(updated);
    });
  }

  /** Deactivates the account (history kept) and revokes its sessions. Idempotent. */
  async deactivate(actorId: number, id: number): Promise<void> {
    if (id === actorId) throw new ConflictException(SELF);
    await this.db.transaction(async (tx) => {
      await this.lockAdmins(tx, id);
      const row = await this.get(tx, id);
      if (row.disabledAt === null) {
        if (row.role === 'admin') await this.assertNotLastAdmin(tx, id);
        await tx.update(users).set({ disabledAt: new Date() }).where(eq(users.id, id));
      }
      await this.sessions.deleteForUser(id, undefined, tx);
    });
  }

  /** Serialises every change that can remove an admin (lock 0) and the target's own login. */
  private async lockAdmins(tx: Transaction, id: number): Promise<void> {
    await lockUser(tx, 0);
    await lockUser(tx, id);
  }

  private async get(tx: Transaction, id: number): Promise<UserRow> {
    const [row] = await tx.select().from(users).where(eq(users.id, id));
    if (!row) throw new NotFoundException();
    return row;
  }

  private async assertNotLastAdmin(tx: Transaction, id: number): Promise<void> {
    const [others] = await tx
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), sql`${users.id} <> ${id}`));
    if ((others?.n ?? 0) === 0) throw new ConflictException(LAST_ADMIN);
  }
}
