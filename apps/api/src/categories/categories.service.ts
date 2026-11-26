import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CategoryDto, CategoryIcon, OffCategoryMapDto } from '@inventaire/shared';
import { and, asc, eq, max } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import type { Transaction } from '../database/database.module';
import { categories, offCategoryMap, products } from '../database/schema';
import { TenantDb } from '../database/tenant-db';

export interface CategoryInput {
  name: string;
  icon: CategoryIcon;
  sortOrder?: number;
  shelfLifeDays?: number | null;
}

export type CategoryPatch = Partial<CategoryInput>;

export interface MapPatch {
  offTag?: string;
  categoryId?: number;
}

const toCategory = (row: typeof categories.$inferSelect): CategoryDto => ({
  id: row.id,
  name: row.name,
  icon: row.icon as CategoryIcon,
  sortOrder: row.sortOrder,
  isFallback: row.isFallback,
  shelfLifeDays: row.shelfLifeDays,
});

// Explicit fields: the household of the row never leaves the API.
const toMap = (row: typeof offCategoryMap.$inferSelect): OffCategoryMapDto => ({
  id: row.id,
  offTag: row.offTag,
  categoryId: row.categoryId,
});

const NAME_TAKEN = 'Une catégorie porte déjà ce nom';
const TAG_TAKEN = 'Ce tag Open Food Facts est déjà associé';

type Scoped = <T>(fn: (tx: Transaction, householdId: number) => Promise<T>) => Promise<T>;

/**
 * Categories and Open Food Facts mappings of one household (D5). Without `householdId`, the
 * household of the request (members read their categories); with it, a household chosen in the
 * admin console, checked by the controller beforehand.
 */
@Injectable()
export class CategoriesService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  private scope(householdId?: number): Scoped {
    return householdId === undefined
      ? (fn) => this.tenant.run(fn)
      : (fn) => this.tenant.forHousehold(householdId, fn);
  }

  async list(householdId?: number): Promise<CategoryDto[]> {
    return this.scope(householdId)(async (tx, hid) => {
      const rows = await tx
        .select()
        .from(categories)
        .where(eq(categories.householdId, hid))
        .orderBy(asc(categories.sortOrder), asc(categories.id));
      return rows.map(toCategory);
    });
  }

  async create(householdId: number, input: CategoryInput): Promise<CategoryDto> {
    try {
      return await this.scope(householdId)(async (tx, hid) => {
        const sortOrder =
          input.sortOrder ??
          ((
            await tx
              .select({ top: max(categories.sortOrder) })
              .from(categories)
              .where(eq(categories.householdId, hid))
          )[0]?.top ?? -1) + 1;
        const [row] = await tx
          .insert(categories)
          .values({
            householdId: hid,
            name: input.name,
            icon: input.icon,
            sortOrder,
            shelfLifeDays: input.shelfLifeDays ?? null,
          })
          .returning();
        return toCategory(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  async update(householdId: number, id: number, patch: CategoryPatch): Promise<CategoryDto> {
    try {
      return await this.scope(householdId)(async (tx, hid) => {
        const [row] = await tx
          .update(categories)
          .set(patch)
          .where(and(eq(categories.id, id), eq(categories.householdId, hid)))
          .returning();
        if (!row) throw new NotFoundException('Catégorie introuvable');
        return toCategory(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  /**
   * Products of the deleted category go to the fallback category ("Autre"), flagged as guessed so
   * that the next add sheet offers to pick a category again; its Open Food Facts mappings are
   * deleted with it (cascade). The products are updated, never read.
   */
  async remove(householdId: number, id: number): Promise<void> {
    await this.scope(householdId)(async (tx, hid) => {
      const [row] = await tx
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.householdId, hid)))
        .for('update');
      if (!row) throw new NotFoundException('Catégorie introuvable');
      if (row.isFallback)
        throw new ConflictException('La catégorie « Autre » ne peut pas être supprimée');
      const [fallback] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.householdId, hid), eq(categories.isFallback, true)));
      if (!fallback) throw new ConflictException('Catégorie de repli introuvable');
      await tx
        .update(products)
        .set({ categoryId: fallback.id, categoryGuessed: true })
        .where(and(eq(products.householdId, hid), eq(products.categoryId, id)));
      await tx
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.householdId, hid)));
    });
  }

  async listMap(householdId: number): Promise<OffCategoryMapDto[]> {
    return this.scope(householdId)(async (tx, hid) => {
      const rows = await tx
        .select()
        .from(offCategoryMap)
        .where(eq(offCategoryMap.householdId, hid))
        .orderBy(asc(offCategoryMap.offTag));
      return rows.map(toMap);
    });
  }

  async createMap(
    householdId: number,
    input: { offTag: string; categoryId: number },
  ): Promise<OffCategoryMapDto> {
    try {
      return await this.scope(householdId)(async (tx, hid) => {
        await this.requireCategory(tx, hid, input.categoryId);
        const [row] = await tx
          .insert(offCategoryMap)
          .values({ householdId: hid, ...input })
          .returning();
        return toMap(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_TAKEN);
      throw error;
    }
  }

  async updateMap(householdId: number, id: number, patch: MapPatch): Promise<OffCategoryMapDto> {
    try {
      return await this.scope(householdId)(async (tx, hid) => {
        if (patch.categoryId !== undefined) await this.requireCategory(tx, hid, patch.categoryId);
        const [row] = await tx
          .update(offCategoryMap)
          .set(patch)
          .where(and(eq(offCategoryMap.id, id), eq(offCategoryMap.householdId, hid)))
          .returning();
        if (!row) throw new NotFoundException('Correspondance introuvable');
        return toMap(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_TAKEN);
      throw error;
    }
  }

  async removeMap(householdId: number, id: number): Promise<void> {
    await this.scope(householdId)(async (tx, hid) => {
      const rows = await tx
        .delete(offCategoryMap)
        .where(and(eq(offCategoryMap.id, id), eq(offCategoryMap.householdId, hid)))
        .returning({ id: offCategoryMap.id });
      if (rows.length === 0) throw new NotFoundException('Correspondance introuvable');
    });
  }

  private async requireCategory(tx: Transaction, householdId: number, id: number): Promise<void> {
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
    if (!row) throw new NotFoundException('Catégorie introuvable');
  }
}
