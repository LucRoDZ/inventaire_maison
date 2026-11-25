import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { createHousehold, HOUSEHOLD, ownerDb, resetAll, seedHousehold } from '../../test/helpers';
import { HouseholdContext } from '../common/household-context';
import { categories, offCategoryMap } from '../database/schema';
import { CategoryGuessService } from './category-guess.service';

let app: INestApplication;
let other: number;
const db = () => ownerDb();

/** Guesses as the household of a signed-in request would. */
const guess = (tags: string[], householdId = HOUSEHOLD) =>
  app.get(HouseholdContext).run(householdId, () => app.get(CategoryGuessService).guess(tags));

async function idOf(tag: string, householdId = HOUSEHOLD): Promise<number> {
  const [row] = await db()
    .select()
    .from(offCategoryMap)
    .where(and(eq(offCategoryMap.offTag, tag), eq(offCategoryMap.householdId, householdId)));
  return row!.categoryId;
}

async function fallbackOf(householdId: number): Promise<number> {
  const [row] = await db()
    .select()
    .from(categories)
    .where(and(eq(categories.isFallback, true), eq(categories.householdId, householdId)));
  return row!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  await resetAll();
  await seedHousehold(app);
  other = await createHousehold(app, 'Voisins');
});

afterAll(async () => {
  await app.close();
});

describe('CategoryGuessService', () => {
  it('prefers the most specific (last) known tag', async () => {
    // Two mapped tags pointing to different categories.
    const rows = await db()
      .select()
      .from(offCategoryMap)
      .where(eq(offCategoryMap.householdId, HOUSEHOLD));
    const a = rows.find((r) => r.categoryId !== rows[0]!.categoryId)!;
    const b = rows[0]!;
    expect(await guess([b.offTag, a.offTag])).toBe(a.categoryId);
    expect(await guess([a.offTag, b.offTag])).toBe(b.categoryId);
    expect(await guess(['en:unknown-thing', b.offTag, 'en:other-unknown'])).toBe(
      await idOf(b.offTag),
    );
  });

  it('falls back to "Autre" when no tag is known, or for an empty list', async () => {
    expect(await guess(['en:nothing-known', 'fr:rien'])).toBe(await fallbackOf(HOUSEHOLD));
    expect(await guess([])).toBe(await fallbackOf(HOUSEHOLD));
  });

  it('only uses the mappings and categories of the household of the request', async () => {
    expect(await guess(['en:waters'], other)).toBe(await idOf('en:waters', other));
    expect(await guess(['en:waters'], other)).not.toBe(await idOf('en:waters'));
    expect(await guess([], other)).toBe(await fallbackOf(other));
  });

  it('refuses to guess without a household', async () => {
    await expect(app.get(CategoryGuessService).guess([])).rejects.toThrow(/Aucun foyer/);
  });
});
