import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserDto, UserRole } from '@inventaire/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { lockUser } from '../auth/user-lock';
import { DB, type Database, type Executor, type Transaction } from '../database/database.module';
import { households, users } from '../database/schema';
import { HOUSEHOLD_NOT_FOUND, HouseholdsService } from '../households/households.service';

type UserRow = typeof users.$inferSelect;

export interface UserPatch {
  role?: UserRole;
  password?: string;
  /** Only `false` is accepted: reactivation. Deactivation is `DELETE`. */
  disabled?: false;
  /** Moves the account to another household: it then sees that inventory, its sessions are cut. */
  householdId?: number;
}

export type UserCreate = { username: string; password: string; role: UserRole } & (
  | { householdId: number; newHouseholdName?: undefined }
  | { householdId?: undefined; newHouseholdName: string }
);

export const USERNAME_TAKEN = 'Ce pseudo existe déjà (même si le compte est désactivé).';
const LAST_ADMIN = 'Impossible : ce compte est le dernier administrateur actif.';
const SELF = 'Impossible sur votre propre compte.';

/** Accounts, for the admin console only (every route of the controller is `@Roles('admin')`). */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
  ) {}

  async list(): Promise<UserDto[]> {
    const rows = await this.db
      .select({ user: users, householdName: households.name })
      .from(users)
      .innerJoin(households, eq(households.id, users.householdId))
      .orderBy(asc(sql`lower(${households.name})`), asc(users.username), asc(users.id));
    return rows.map((r) => this.toDto(r.user, r.householdName));
  }

  /** Creates an account in an existing household, or in a new one created in the same transaction. */
  async create(input: UserCreate): Promise<UserDto> {
    const username = input.username.toLowerCase();
    await this.assertUsernameFree(this.db, username);
    const passwordHash = await this.passwords.hash(input.password);
    const insert = async (tx: Executor, householdId: number) => {
      const inserted = await tx
        .insert(users)
        .values({ username, passwordHash, role: input.role, householdId })
        .onConflictDoNothing()
        .returning();
      // A concurrent creation of the same pseudo hit the unique index.
      if (inserted[0] === undefined) throw new ConflictException(USERNAME_TAKEN);
      return inserted[0];
    };
    if (input.newHouseholdName !== undefined) {
      const created = await this.households.create(input.newHouseholdName, (tx, householdId) =>
        insert(tx, householdId),
      );
      return this.toDto(created.extra!, created.name);
    }
    const householdId = input.householdId;
    // The household row is locked: it cannot be deleted while its new account is being written.
    return this.db.transaction(async (tx) => {
      const [household] = await tx
        .select({ name: households.name })
        .from(households)
        .where(eq(households.id, householdId))
        .for('share');
      if (!household) throw new NotFoundException(HOUSEHOLD_NOT_FOUND);
      return this.toDto(await insert(tx, householdId), household.name);
    });
  }

  async update(actorId: number, id: number, patch: UserPatch): Promise<UserDto> {
    if (
      id === actorId &&
      (patch.role !== undefined || patch.password !== undefined || patch.householdId !== undefined)
    ) {
      throw new ConflictException(
        patch.password !== undefined && patch.role === undefined && patch.householdId === undefined
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
      const moves = patch.householdId !== undefined && patch.householdId !== row.householdId;
      if (moves) {
        const [target] = await tx
          .select({ id: households.id })
          .from(households)
          .where(eq(households.id, patch.householdId!))
          .for('share');
        if (!target) throw new NotFoundException(HOUSEHOLD_NOT_FOUND);
        set.householdId = patch.householdId;
      }
      if (passwordHash !== undefined) set.passwordHash = passwordHash;
      if (patch.disabled === false) set.disabledAt = null;
      let updated = row;
      if (Object.keys(set).length > 0) {
        const [changed] = await tx.update(users).set(set).where(eq(users.id, id)).returning();
        updated = changed ?? row;
      }
      // A new password, or another household (another inventory), cuts every open session.
      if (passwordHash !== undefined || moves) {
        await this.sessions.deleteForUser(id, undefined, tx);
      }
      const [household] = await tx
        .select({ name: households.name })
        .from(households)
        .where(eq(households.id, updated.householdId));
      return this.toDto(updated, household?.name ?? '');
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

  private toDto(row: UserRow, householdName: string): UserDto {
    return {
      id: row.id,
      username: row.username,
      role: row.role as UserRole,
      disabled: row.disabledAt !== null,
      createdAt: row.createdAt.toISOString(),
      household: { id: row.householdId, name: householdName },
    };
  }

  private async assertUsernameFree(executor: Executor, username: string): Promise<void> {
    const [taken] = await executor
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.username})`, username));
    if (taken) throw new ConflictException(USERNAME_TAKEN);
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
