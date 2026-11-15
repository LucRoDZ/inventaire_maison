import { Inject, Injectable } from '@nestjs/common';
import type {
  HomeLocationDto,
  HomeResponse,
  HomeTileDto,
  LocationKind,
  ShelfKind,
  StockListItemDto,
} from '@inventaire/shared';
import { asc } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { locations, shelves } from '../database/schema';
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
    @Inject(DB) private readonly db: Database,
    @Inject(StockQuery) private readonly stock: StockQuery,
  ) {}

  async get(): Promise<HomeResponse> {
    const [places, shelfRows, { items }] = await Promise.all([
      this.db.select().from(locations).orderBy(asc(locations.sortOrder), asc(locations.id)),
      this.db.select().from(shelves).orderBy(asc(shelves.sortOrder), asc(shelves.id)),
      this.stock.list({ sort: 'name' }),
    ]);

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
            expiringSoon: lines.filter((l) => l.expiry !== null).length,
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
