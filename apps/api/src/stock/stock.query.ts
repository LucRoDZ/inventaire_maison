import { Inject, Injectable } from '@nestjs/common';
import {
  EXPIRY_SOON_DAYS,
  type ExpiryStatus,
  type LocationCountDto,
  type StockListItemDto,
  type StockListResponse,
  type StockSort,
} from '@inventaire/shared';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { categories, locations, products, shelves, stockItems } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import type { Transaction } from '../database/database.module';
import { normalizeSearch } from '../products/search-text';

export interface StockFilters {
  location?: number;
  shelf?: number;
  category?: number;
  q?: string;
  sort: StockSort;
}

/** Today's date in Paris as `YYYY-MM-DD`. */
export function parisToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function expiryStatus(daysLeft: number | null): ExpiryStatus | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return { status: 'expired' };
  if (daysLeft <= EXPIRY_SOON_DAYS) return { status: 'soon', days: daysLeft };
  return null;
}

@Injectable()
export class StockQuery {
  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(filters: StockFilters): Promise<StockListResponse> {
    return this.tenant.run((tx, householdId) => this.listIn(tx, householdId, filters));
  }

  private async listIn(
    tx: Transaction,
    householdId: number,
    filters: StockFilters,
  ): Promise<StockListResponse> {
    const today = parisToday(this.clock.now());
    const term = filters.q ? normalizeSearch(filters.q) : '';

    // Filters shared by the lines and the per-location counters.
    const shared: SQL[] = [eq(stockItems.householdId, householdId)];
    if (filters.category !== undefined) shared.push(eq(products.categoryId, filters.category));
    if (term !== '') shared.push(sql`position(${term} in ${products.searchText}) > 0`);

    const lineConditions = [...shared];
    if (filters.location !== undefined)
      lineConditions.push(eq(stockItems.locationId, filters.location));
    if (filters.shelf !== undefined) lineConditions.push(eq(stockItems.shelfId, filters.shelf));

    const daysLeft = sql<number | null>`(${stockItems.expiryDate} - ${today}::date)`;
    const order = {
      name: [asc(products.name), asc(stockItems.id)],
      added: [desc(stockItems.createdAt), desc(stockItems.id)],
      expiry: [
        sql`${stockItems.expiryDate} asc nulls last`,
        asc(products.name),
        asc(stockItems.id),
      ],
    }[filters.sort];

    const rows = await tx
      .select({
        line: stockItems,
        product: products,
        category: categories,
        locationName: locations.name,
        shelfName: shelves.name,
        daysLeft,
      })
      .from(stockItems)
      .innerJoin(
        products,
        and(eq(products.id, stockItems.productId), eq(products.householdId, householdId)),
      )
      .innerJoin(
        categories,
        and(eq(categories.id, products.categoryId), eq(categories.householdId, householdId)),
      )
      .innerJoin(
        locations,
        and(eq(locations.id, stockItems.locationId), eq(locations.householdId, householdId)),
      )
      .leftJoin(
        shelves,
        and(eq(shelves.id, stockItems.shelfId), eq(shelves.householdId, householdId)),
      )
      .where(and(...lineConditions))
      .orderBy(...order);

    const items: StockListItemDto[] = rows.map((row) => ({
      id: row.line.id,
      quantity: row.line.quantity,
      expiryDate: row.line.expiryDate,
      expiry: expiryStatus(row.daysLeft === null ? null : Number(row.daysLeft)),
      createdAt: row.line.createdAt.toISOString(),
      product: {
        id: row.product.id,
        name: row.product.name,
        brand: row.product.brand,
        sizeLabel: row.product.sizeLabel,
        imageUrl: row.product.imagePath ? `/api/images/${row.product.imagePath}` : null,
        categoryGuessed: row.product.categoryGuessed,
      },
      category: { id: row.category.id, name: row.category.name, icon: row.category.icon },
      location: { id: row.line.locationId, name: row.locationName },
      shelf: row.line.shelfId === null ? null : { id: row.line.shelfId, name: row.shelfName ?? '' },
    }));

    const totals = await tx
      .select({
        locationId: stockItems.locationId,
        products: sql<number>`count(distinct ${stockItems.productId})::int`,
        units: sql<number>`sum(${stockItems.quantity})::int`,
      })
      .from(stockItems)
      .innerJoin(
        products,
        and(eq(products.id, stockItems.productId), eq(products.householdId, householdId)),
      )
      .where(and(...shared))
      .groupBy(stockItems.locationId);
    const byLocation = new Map(totals.map((row) => [row.locationId, row]));
    const allLocations = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.householdId, householdId))
      .orderBy(asc(locations.sortOrder), asc(locations.id));
    const counts: LocationCountDto[] = allLocations.map(({ id }) => ({
      locationId: id,
      products: byLocation.get(id)?.products ?? 0,
      units: byLocation.get(id)?.units ?? 0,
    }));

    return { items, counts };
  }
}
