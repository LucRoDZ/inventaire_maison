import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CategoryDto, CategoryIcon, OffCategoryMapDto } from '@inventaire/shared';
import { asc, eq, max } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import { DB, type Database } from '../database/database.module';
import { categories, offCategoryMap, products } from '../database/schema';

export interface CategoryInput {
  name: string;
  icon: CategoryIcon;
  sortOrder?: number;
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
});

const NAME_TAKEN = 'Une catégorie porte déjà ce nom';
const TAG_TAKEN = 'Ce tag Open Food Facts est déjà associé';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id));
    return rows.map(toCategory);
  }

  async create(input: CategoryInput): Promise<CategoryDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const sortOrder =
          input.sortOrder ??
          ((await tx.select({ top: max(categories.sortOrder) }).from(categories))[0]?.top ?? -1) +
            1;
        const [row] = await tx
          .insert(categories)
          .values({ name: input.name, icon: input.icon, sortOrder })
          .returning();
        return toCategory(row!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  async update(id: number, patch: CategoryPatch): Promise<CategoryDto> {
    try {
      const [row] = await this.db
        .update(categories)
        .set(patch)
        .where(eq(categories.id, id))
        .returning();
      if (!row) throw new NotFoundException('Catégorie introuvable');
      return toCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  /**
   * Products of the deleted category go to the fallback category ("Autre"), flagged as guessed so
   * that the next add sheet offers to pick a category again; its Open Food Facts mappings are deleted with it (cascade).
   */
  async remove(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
      if (!row) throw new NotFoundException('Catégorie introuvable');
      if (row.isFallback)
        throw new ConflictException('La catégorie « Autre » ne peut pas être supprimée');
      const [fallback] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.isFallback, true));
      if (!fallback) throw new ConflictException('Catégorie de repli introuvable');
      await tx
        .update(products)
        .set({ categoryId: fallback.id, categoryGuessed: true })
        .where(eq(products.categoryId, id));
      await tx.delete(categories).where(eq(categories.id, id));
    });
  }

  async listMap(): Promise<OffCategoryMapDto[]> {
    const rows = await this.db.select().from(offCategoryMap).orderBy(asc(offCategoryMap.offTag));
    return rows;
  }

  async createMap(input: { offTag: string; categoryId: number }): Promise<OffCategoryMapDto> {
    await this.requireCategory(input.categoryId);
    try {
      const [row] = await this.db.insert(offCategoryMap).values(input).returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_TAKEN);
      throw error;
    }
  }

  async updateMap(id: number, patch: MapPatch): Promise<OffCategoryMapDto> {
    if (patch.categoryId !== undefined) await this.requireCategory(patch.categoryId);
    try {
      const [row] = await this.db
        .update(offCategoryMap)
        .set(patch)
        .where(eq(offCategoryMap.id, id))
        .returning();
      if (!row) throw new NotFoundException('Correspondance introuvable');
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_TAKEN);
      throw error;
    }
  }

  async removeMap(id: number): Promise<void> {
    const rows = await this.db
      .delete(offCategoryMap)
      .where(eq(offCategoryMap.id, id))
      .returning({ id: offCategoryMap.id });
    if (rows.length === 0) throw new NotFoundException('Correspondance introuvable');
  }

  private async requireCategory(id: number): Promise<void> {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id));
    if (!row) throw new NotFoundException('Catégorie introuvable');
  }
}
