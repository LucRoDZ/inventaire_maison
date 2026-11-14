import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { count } from 'drizzle-orm';
import { DB, MigrationRunner, type Database } from '../database.module';
import { categories, locations, offCategoryMap, shelves } from '../schema';
import { CATEGORY_SEEDS } from './categories';
import { LOCATION_SEEDS } from './locations';
import { OFF_CATEGORY_MAP_SEEDS } from './off-category-map';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    // Injected so that migrations always run first.
    @Inject(MigrationRunner) private readonly migrations: MigrationRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  /** Fills each reference table only when it is empty, so renamed or deleted rows stay as they are. */
  async seed(): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [categoryCount] = await tx.select({ n: count() }).from(categories);
      if (categoryCount?.n === 0) {
        await tx
          .insert(categories)
          .values(
            CATEGORY_SEEDS.map((c, i) => ({ ...c, sortOrder: i, isFallback: !!c.isFallback })),
          );
        this.logger.log(`${CATEGORY_SEEDS.length} catégories créées`);
      }

      const [mapCount] = await tx.select({ n: count() }).from(offCategoryMap);
      if (mapCount?.n === 0) {
        const byName = new Map((await tx.select().from(categories)).map((c) => [c.name, c.id]));
        const rows = Object.entries(OFF_CATEGORY_MAP_SEEDS).flatMap(([name, tags]) => {
          const categoryId = byName.get(name);
          return categoryId === undefined ? [] : tags.map((offTag) => ({ offTag, categoryId }));
        });
        if (rows.length > 0) await tx.insert(offCategoryMap).values(rows);
      }

      const [locationCount] = await tx.select({ n: count() }).from(locations);
      if (locationCount?.n === 0) {
        for (const [index, seed] of LOCATION_SEEDS.entries()) {
          const [location] = await tx
            .insert(locations)
            .values({ name: seed.name, kind: seed.kind, icon: seed.icon, sortOrder: index })
            .returning({ id: locations.id });
          await tx.insert(shelves).values(
            seed.shelves.map((shelf, order) => ({
              locationId: location!.id,
              name: shelf.name,
              kind: shelf.kind,
              sortOrder: order,
            })),
          );
        }
        this.logger.log(`${LOCATION_SEEDS.length} lieux créés`);
      }
    });
  }
}
