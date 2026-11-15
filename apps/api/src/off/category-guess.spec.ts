import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { DB, type Database } from '../database/database.module';
import { categories, offCategoryMap } from '../database/schema';
import { CategoryGuessService } from './category-guess.service';

let app: INestApplication;
let service: CategoryGuessService;
let db: Database;

async function idOf(tag: string): Promise<number> {
  const [row] = await db.select().from(offCategoryMap).where(eq(offCategoryMap.offTag, tag));
  return row!.categoryId;
}

beforeAll(async () => {
  app = await createTestApp();
  service = new CategoryGuessService(app.get<Database>(DB));
  db = app.get<Database>(DB);
});

afterAll(async () => {
  await app.close();
});

describe('CategoryGuessService', () => {
  it('prefers the most specific (last) known tag', async () => {
    // Two mapped tags pointing to different categories.
    const rows = await db.select().from(offCategoryMap);
    const a = rows.find((r) => r.categoryId !== rows[0]!.categoryId)!;
    const b = rows[0]!;
    expect(await service.guess([b.offTag, a.offTag])).toBe(a.categoryId);
    expect(await service.guess([a.offTag, b.offTag])).toBe(b.categoryId);
    expect(await service.guess(['en:unknown-thing', b.offTag, 'en:other-unknown'])).toBe(
      await idOf(b.offTag),
    );
  });

  it('falls back to "Autre" when no tag is known', async () => {
    const [other] = await db.select().from(categories).where(eq(categories.isFallback, true));
    expect(await service.guess(['en:nothing-known', 'fr:rien'])).toBe(other!.id);
  });

  it('falls back to "Autre" for an empty list', async () => {
    const [other] = await db.select().from(categories).where(eq(categories.isFallback, true));
    expect(await service.guess([])).toBe(other!.id);
  });
});
