import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { categories, offCategoryMap } from '../database/schema';

@Injectable()
export class CategoryGuessService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Walks the tags from the last (most specific) to the first and keeps the first one that is
   * mapped; otherwise the fallback category "Autre". The caller flags the result as guessed.
   */
  async guess(tags: readonly string[]): Promise<number> {
    if (tags.length > 0) {
      const rows = await this.db
        .select({ tag: offCategoryMap.offTag, categoryId: offCategoryMap.categoryId })
        .from(offCategoryMap)
        .where(inArray(offCategoryMap.offTag, [...tags]));
      const byTag = new Map(rows.map((row) => [row.tag, row.categoryId]));
      for (const tag of [...tags].reverse()) {
        const id = byTag.get(tag);
        if (id !== undefined) return id;
      }
    }
    const [fallback] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.isFallback, true));
    if (!fallback) throw new Error('Catégorie de repli « Autre » introuvable');
    return fallback.id;
  }
}
