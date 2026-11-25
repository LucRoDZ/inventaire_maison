import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HouseholdDto, UserRole } from '@inventaire/shared';
import { asc, count, eq, sql } from 'drizzle-orm';
import { isUniqueViolation, pgConstraint } from '../common/pg-errors';
import { DB, type Database, type Transaction } from '../database/database.module';
import { households, users } from '../database/schema';
import { applyHouseholdTemplate } from '../database/seed/household-template';
import { TenantDb } from '../database/tenant-db';
import { ImageStore } from '../images/image-store.service';
import { LocationsService } from '../locations/locations.service';

export const HOUSEHOLD_NAME_TAKEN = 'Un foyer porte déjà ce nom';
export const HOUSEHOLD_NOT_FOUND = 'Foyer introuvable';

/**
 * Households, for the admin console and the start-up only (D2, D3). This service reads the
 * households and the accounts; it never reads the data of a household. Creating one copies the
 * model (categories, mappings, furniture) in the same transaction.
 */
@Injectable()
export class HouseholdsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(LocationsService) private readonly locations: LocationsService,
    @Inject(ImageStore) private readonly images: ImageStore,
  ) {}

  async list(ownHouseholdId?: number): Promise<HouseholdDto[]> {
    const rows = await this.db
      .select()
      .from(households)
      .orderBy(asc(sql`lower(${households.name})`), asc(households.id));
    const accounts = await this.db.select().from(users).orderBy(asc(users.username), asc(users.id));
    const result: HouseholdDto[] = [];
    for (const row of rows) {
      result.push({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        members: accounts
          .filter((u) => u.householdId === row.id)
          .map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role as UserRole,
            disabled: u.disabledAt !== null,
          })),
        locationCount: await this.locations.countIn(row.id),
        isOwn: row.id === ownHouseholdId,
      });
    }
    return result;
  }

  /** 404 unless the household exists; returns its name. */
  async require(id: number): Promise<string> {
    const [row] = await this.db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, id));
    if (!row) throw new NotFoundException(HOUSEHOLD_NOT_FOUND);
    return row.name;
  }

  /**
   * Creates a household with a copy of the model and, in the same transaction, whatever `then`
   * adds (the account created with it). One transaction: all or nothing.
   */
  async create<T = undefined>(
    name: string,
    then?: (tx: Transaction, householdId: number) => Promise<T>,
  ): Promise<{ id: number; name: string; extra: T | undefined }> {
    try {
      return await this.tenant.withNewHousehold(
        async (tx) => {
          const [row] = await tx.insert(households).values({ name }).returning();
          return row!.id;
        },
        async (tx, householdId) => {
          await applyHouseholdTemplate(tx, householdId);
          const extra = then ? await then(tx, householdId) : undefined;
          return { id: householdId, name, extra };
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw this.uniqueError(error);
      throw error;
    }
  }

  /**
   * `npm run household:create`: a household and its first admin account, in one transaction
   * (amorce d'une instance vide, decision D3). `passwordHash` is already an argon2id hash.
   */
  async createWithAdmin(
    name: string,
    username: string,
    passwordHash: string,
  ): Promise<{ id: number; name: string }> {
    const created = await this.create(name, (tx, householdId) =>
      tx.insert(users).values({ username, passwordHash, role: 'admin', householdId }).returning(),
    );
    return { id: created.id, name: created.name };
  }

  async rename(id: number, name: string): Promise<{ id: number; name: string }> {
    try {
      const [row] = await this.db
        .update(households)
        .set({ name })
        .where(eq(households.id, id))
        .returning();
      if (!row) throw new NotFoundException(HOUSEHOLD_NOT_FOUND);
      return { id: row.id, name: row.name };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(HOUSEHOLD_NAME_TAKEN);
      throw error;
    }
  }

  /**
   * Deletes a household that has no account any more, with all its data (cascade) and pictures.
   * `confirmName` must repeat its name exactly (type-to-confirm): only a backup brings it back.
   */
  async remove(id: number, confirmName: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(households).where(eq(households.id, id)).for('update');
      if (!row) throw new NotFoundException(HOUSEHOLD_NOT_FOUND);
      const [accounts] = await tx
        .select({ n: count() })
        .from(users)
        .where(eq(users.householdId, id));
      if ((accounts?.n ?? 0) > 0) {
        throw new ConflictException(
          'Ce foyer a encore des comptes : déplacez-les dans un autre foyer avant de le supprimer.',
        );
      }
      if (confirmName !== row.name) {
        throw new BadRequestException('Le nom saisi ne correspond pas au nom du foyer.');
      }
      // The foreign keys cascade to every data table; they run as the owner of each table.
      await tx.delete(households).where(eq(households.id, id));
    });
    await this.images.removeHousehold(id);
  }

  private uniqueError(error: unknown): ConflictException {
    if (pgConstraint(error) === 'users_username_lower_key') {
      return new ConflictException('Ce pseudo existe déjà (même si le compte est désactivé).');
    }
    return new ConflictException(HOUSEHOLD_NAME_TAKEN);
  }
}
