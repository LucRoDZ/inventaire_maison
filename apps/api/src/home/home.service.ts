import { Inject, Injectable } from '@nestjs/common';
import type {
  HomeLocationDto,
  HomeResponse,
  HomeTileDto,
  LocationKind,
  ShelfKind,
  StockListItemDto,
} from '@inventaire/shared';
import { asc, eq } from 'drizzle-orm';
import { locations, shelves } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { StockQuery } from '../stock/stock.query';

const toTile = (item: StockListItemDto): HomeTileDto => ({
  stockItemId: item.id,
  productId: item.product.id,
  name: item.product.name,
  brand: item.product.brand,
  imageUrl: item.product.imageUrl,
  category: item.category,
  quantity: item.quantity,
  expiryDate: item.expiryDate,
  expiry: item.expiry,
});

@Injectable()
export class HomeService {
  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(StockQuery) private readonly stock: StockQuery,
  ) {}

  async get(): Promise<HomeResponse> {
    // One transaction for the three reads: the stock query joins it.
    return this.tenant.run(async (tx, householdId) => {
      const places = await tx
        .select()
        .from(locations)
        .where(eq(locations.householdId, householdId))
        .orderBy(asc(locations.sortOrder), asc(locations.id));
      const shelfRows = await tx
        .select()
        .from(shelves)
        .where(eq(shelves.householdId, householdId))
        .orderBy(asc(shelves.sortOrder), asc(shelves.id));
      const { items } = await this.stock.list({ sort: 'name' });
      return HomeService.build(places, shelfRows, items);
    });
  }

  private static build(
    places: (typeof locations.$inferSelect)[],
    shelfRows: (typeof shelves.$inferSelect)[],
    items: StockListItemDto[],
  ): HomeResponse {
    return {
      locations: places.map((place): HomeLocationDto => {
        const lines = items.filter((item) => item.location.id === place.id);
        return {
          id: place.id,
          name: place.name,
          kind: place.kind as LocationKind,
          icon: place.icon,
          counts: {
            products: new Set(lines.map((l) => l.product.id)).size,
            units: lines.reduce((sum, l) => sum + l.quantity, 0),
            expired: lines.filter((l) => l.expiry?.status === 'expired').length,
            soon: lines.filter((l) => l.expiry?.status === 'soon').length,
          },
          shelves: shelfRows
            .filter((shelf) => shelf.locationId === place.id)
            .map((shelf) => ({
              id: shelf.id,
              name: shelf.name,
              kind: shelf.kind as ShelfKind,
              tiles: lines.filter((l) => l.shelf?.id === shelf.id).map(toTile),
            })),
          unshelved: lines.filter((l) => l.shelf === null).map(toTile),
        };
      }),
    };
  }
}
