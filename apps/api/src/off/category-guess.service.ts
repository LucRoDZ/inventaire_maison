import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { categories, offCategoryMap } from '../database/schema';
import { TenantDb } from '../database/tenant-db';

@Injectable()
export class CategoryGuessService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  /**
   * Walks the tags from the last (most specific) to the first and keeps the first one that is
   * mapped in the household; otherwise its fallback category "Autre". The caller flags the result
   * as guessed.
   */
  async guess(tags: readonly string[]): Promise<number> {
    return this.tenant.run(async (tx, householdId) => {
      if (tags.length > 0) {
        const rows = await tx
          .select({ tag: offCategoryMap.offTag, categoryId: offCategoryMap.categoryId })
          .from(offCategoryMap)
          .where(
            and(
              eq(offCategoryMap.householdId, householdId),
              inArray(offCategoryMap.offTag, [...tags]),
            ),
          );
        const byTag = new Map(rows.map((row) => [row.tag, row.categoryId]));
        for (const tag of [...tags].reverse()) {
          const id = byTag.get(tag);
          if (id !== undefined) return id;
        }
      }
      const [fallback] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.householdId, householdId), eq(categories.isFallback, true)));
      if (!fallback) throw new Error('Catégorie de repli « Autre » introuvable');
      return fallback.id;
    });
  }
}
