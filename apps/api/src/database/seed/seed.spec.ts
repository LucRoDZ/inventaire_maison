import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../../../test/temp-database';
import { bindHousehold } from '../tenant-db';
import { categories, households, locations, shelves } from '../schema';
import { CATEGORY_SEEDS } from './categories';
import { applyHouseholdTemplate } from './household-template';
import { LOCATION_SEEDS, MAX_SEED_SHELVES } from './locations';
import { OFF_CATEGORY_MAP_SEEDS } from './off-category-map';

let tmp: TempDatabase;

async function counts(householdId: number) {
  const n = async (table: string) =>
    (
      await tmp.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE household_id = $1`,
        [householdId],
      )
    ).rows[0]!.n;
  return {
    categories: await n('categories'),
    map: await n('off_category_map'),
    locations: await n('locations'),
    shelves: await n('shelves'),
  };
}

async function newHousehold(name: string): Promise<number> {
  const [row] = await tmp.db.insert(households).values({ name }).returning();
  await tmp.db.transaction(async (tx) => {
    await bindHousehold(tx, row!.id);
    await applyHouseholdTemplate(tx, row!.id);
  });
  return row!.id;
}

beforeAll(async () => {
  tmp = await createTempDatabase();
});

afterAll(async () => {
  await tmp.drop();
});

beforeEach(async () => {
  await tmp.pool.query(
    'TRUNCATE off_category_map, categories, shelves, locations, households RESTART IDENTITY CASCADE',
  );
});

describe('household template', () => {
  it('gives a new household 15 categories, 4 pieces of furniture and 15 shelves', async () => {
    const id = await newHousehold('Famille');
    const result = await counts(id);
    expect(result.categories).toBe(15);
    expect(result.locations).toBe(4);
    expect(result.shelves).toBe(15);
    expect(result.map).toBeGreaterThanOrEqual(75);
  });

  it('copies the model again for each household, independently', async () => {
    const a = await newHousehold('A');
    const b = await newHousehold('B');
    expect(await counts(b)).toEqual(await counts(a));
    await tmp.db
      .update(locations)
      .set({ name: 'Cellier' })
      .where(and(eq(locations.householdId, a), eq(locations.name, 'Cave')));
    const names = (await tmp.db.select().from(locations).where(eq(locations.householdId, b))).map(
      (l) => l.name,
    );
    expect(names).toContain('Cave');
  });

  it('marks exactly one fallback category, named "Autre"', async () => {
    await newHousehold('Famille');
    const fallback = await tmp.db.select().from(categories).where(eq(categories.isFallback, true));
    expect(fallback.map((c) => c.name)).toEqual(['Autre']);
  });

  it('maps at least 3 tags to every category except Autre and Hygiène', () => {
    for (const category of CATEGORY_SEEDS) {
      if (category.name === 'Autre' || category.name.startsWith('Hygiène')) continue;
      expect(OFF_CATEGORY_MAP_SEEDS[category.name]?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives the cellar three racks and one plain shelf', async () => {
    await newHousehold('Famille');
    const [cave] = await tmp.db.select().from(locations).where(eq(locations.kind, 'cellar'));
    const rows = await tmp.db.select().from(shelves).where(eq(shelves.locationId, cave!.id));
    expect(rows.filter((s) => s.kind === 'rack')).toHaveLength(3);
    expect(rows.filter((s) => s.kind === 'plain').map((s) => s.name)).toEqual(['Caisses et packs']);
  });

  it('gives no furniture more than four shelves, so that it fits on a phone', () => {
    expect(MAX_SEED_SHELVES).toBe(4);
    for (const location of LOCATION_SEEDS) {
      expect(location.shelves.length, location.name).toBeLessThanOrEqual(MAX_SEED_SHELVES);
    }
  });

  it('gives the fridge three shelves and a vegetable drawer', async () => {
    await newHousehold('Famille');
    const [frigo] = await tmp.db.select().from(locations).where(eq(locations.kind, 'fridge'));
    const rows = await tmp.db.select().from(shelves).where(eq(shelves.locationId, frigo!.id));
    expect(rows.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.name)).toEqual([
      'Étagère 1',
      'Étagère 2',
      'Étagère 3',
      'Bac à légumes',
    ]);
  });
});
