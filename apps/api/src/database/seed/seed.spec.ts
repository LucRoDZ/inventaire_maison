import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../../../test/temp-database';
import type { MigrationRunner } from '../database.module';
import { categories, locations, offCategoryMap, shelves } from '../schema';
import { CATEGORY_SEEDS } from './categories';
import { LOCATION_SEEDS, MAX_SEED_SHELVES } from './locations';
import { OFF_CATEGORY_MAP_SEEDS } from './off-category-map';
import { SeedService } from './seed.service';

let tmp: TempDatabase;
let service: SeedService;

async function counts() {
  const [c] = await tmp.db.select({ n: count() }).from(categories);
  const [m] = await tmp.db.select({ n: count() }).from(offCategoryMap);
  const [l] = await tmp.db.select({ n: count() }).from(locations);
  const [s] = await tmp.db.select({ n: count() }).from(shelves);
  return { categories: c!.n, map: m!.n, locations: l!.n, shelves: s!.n };
}

beforeAll(async () => {
  tmp = await createTempDatabase();
  service = new SeedService(tmp.db, {} as MigrationRunner);
});

afterAll(async () => {
  await tmp.drop();
});

beforeEach(async () => {
  await tmp.pool.query(
    'TRUNCATE off_category_map, categories, shelves, locations RESTART IDENTITY CASCADE',
  );
});

describe('SeedService', () => {
  it('fills an empty database with 15 categories, 4 locations and 15 shelves', async () => {
    await service.seed();
    const result = await counts();
    expect(result.categories).toBe(15);
    expect(result.locations).toBe(4);
    expect(result.shelves).toBe(15);
    expect(result.map).toBeGreaterThanOrEqual(75);
  });

  it('marks exactly one fallback category, named "Autre"', async () => {
    await service.seed();
    const fallback = await tmp.db.select().from(categories).where(eq(categories.isFallback, true));
    expect(fallback.map((c) => c.name)).toEqual(['Autre']);
  });

  it('maps at least 3 tags to every category except Autre and Hygiène', () => {
    for (const category of CATEGORY_SEEDS) {
      if (category.name === 'Autre' || category.name.startsWith('Hygiène')) continue;
      expect(OFF_CATEGORY_MAP_SEEDS[category.name]?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('does not duplicate anything on a second run', async () => {
    await service.seed();
    const first = await counts();
    await service.seed();
    expect(await counts()).toEqual(first);
  });

  it('does not recreate a renamed location', async () => {
    await service.seed();
    await tmp.db.update(locations).set({ name: 'Cellier' }).where(eq(locations.name, 'Cave'));
    await service.seed();
    const names = (await tmp.db.select().from(locations)).map((l) => l.name);
    expect(names).toContain('Cellier');
    expect(names).not.toContain('Cave');
    expect(names).toHaveLength(4);
  });

  it('gives the cellar three racks and one plain shelf', async () => {
    await service.seed();
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
    await service.seed();
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
