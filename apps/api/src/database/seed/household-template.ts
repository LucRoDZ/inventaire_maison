import type { Transaction } from '../database.module';
import { categories, locations, offCategoryMap, shelves } from '../schema';
import { CATEGORY_SEEDS } from './categories';
import { LOCATION_SEEDS } from './locations';
import { OFF_CATEGORY_MAP_SEEDS } from './off-category-map';

/**
 * Copies the model into a new household (D5): the 15 categories, the Open Food Facts mappings and
 * the four pieces of furniture of the seed with their shelves. `tx` is already bound to the
 * household (TenantDb); every row also carries it explicitly.
 */
export async function applyHouseholdTemplate(tx: Transaction, householdId: number): Promise<void> {
  const created = await tx
    .insert(categories)
    .values(
      CATEGORY_SEEDS.map((c, i) => ({
        householdId,
        name: c.name,
        icon: c.icon,
        sortOrder: i,
        isFallback: !!c.isFallback,
        shelfLifeDays: c.shelfLifeDays ?? null,
      })),
    )
    .returning({ id: categories.id, name: categories.name });
  const byName = new Map(created.map((c) => [c.name, c.id]));
  const mappings = Object.entries(OFF_CATEGORY_MAP_SEEDS).flatMap(([name, tags]) => {
    const categoryId = byName.get(name);
    return categoryId === undefined
      ? []
      : tags.map((offTag) => ({ householdId, offTag, categoryId }));
  });
  if (mappings.length > 0) await tx.insert(offCategoryMap).values(mappings);

  for (const [index, seed] of LOCATION_SEEDS.entries()) {
    const [location] = await tx
      .insert(locations)
      .values({ householdId, name: seed.name, kind: seed.kind, icon: seed.icon, sortOrder: index })
      .returning({ id: locations.id });
    await tx.insert(shelves).values(
      seed.shelves.map((shelf, order) => ({
        householdId,
        locationId: location!.id,
        name: shelf.name,
        kind: shelf.kind,
        sortOrder: order,
      })),
    );
  }
}
