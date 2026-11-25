import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LOCATION_KIND_DEFAULTS,
  MAX_LOCATIONS_PER_HOUSEHOLD,
  MAX_SHELVES_PER_LOCATION,
  type LocationCreateInput,
  type LocationDto,
  type LocationKind,
  type ShelfDto,
  type ShelfKind,
} from '@inventaire/shared';
import { and, asc, count, eq, isNull, max, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import type { Transaction } from '../database/database.module';
import {
  households,
  locations,
  products,
  shelves,
  stockItems,
  stockMovements,
} from '../database/schema';
import { LOCATION_SEEDS, type ShelfSeed } from '../database/seed/locations';
import { TenantDb } from '../database/tenant-db';
import { lockProductLocation, placeNames } from '../stock/stock.service';

export interface LocationPatch {
  name?: string;
  icon?: string;
  sortOrder?: number;
}

export interface ShelfInput {
  locationId: number;
  name: string;
  kind: ShelfKind;
  sortOrder?: number;
}

export type ShelfPatch = Partial<ShelfInput>;

export const LOCATION_NAME_TAKEN = 'Un meuble porte déjà ce nom';
export const TOO_MANY_LOCATIONS = `Vous avez déjà ${MAX_LOCATIONS_PER_HOUSEHOLD} meubles : c’est le maximum.`;
export const TOO_MANY_SHELVES = `Ce meuble a déjà ${MAX_SHELVES_PER_LOCATION} étagères ou tiroirs : c’est le maximum.`;
export const STOCK_NEEDS_DESTINATION =
  'Ce meuble contient des produits : choisissez le meuble qui les recevra.';

/**
 * Shelves of a new piece of furniture. The default count of the kind gives the shelves of the
 * seed (« Bac à légumes », « Caisses et packs »…); another count gives « Étagère n », « Tiroir n »
 * or « Rangée n ».
 */
export function defaultShelves(kind: LocationKind, count?: number): ShelfSeed[] {
  const defaults = LOCATION_KIND_DEFAULTS[kind];
  const seed = LOCATION_SEEDS.find((s) => s.kind === kind);
  const wanted = count ?? defaults.shelfCount;
  if (seed && wanted === seed.shelves.length) return seed.shelves.map((s) => ({ ...s }));
  return Array.from({ length: wanted }, (_, i) => ({
    name: `${defaults.shelfLabel} ${i + 1}`,
    kind: defaults.shelfKind,
  }));
}

export function toShelf(row: typeof shelves.$inferSelect): ShelfDto {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    kind: row.kind as ShelfKind,
    sortOrder: row.sortOrder,
  };
}

export function toLocation(
  row: typeof locations.$inferSelect,
  shelfRows: (typeof shelves.$inferSelect)[],
  productCount = 0,
): LocationDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as LocationDto['kind'],
    icon: row.icon,
    sortOrder: row.sortOrder,
    shelves: shelfRows.filter((s) => s.locationId === row.id).map(toShelf),
    productCount,
  };
}

@Injectable()
export class LocationsService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  async list(): Promise<LocationDto[]> {
    return this.tenant.run(async (tx, householdId) => {
      const locationRows = await tx
        .select()
        .from(locations)
        .where(eq(locations.householdId, householdId))
        .orderBy(asc(locations.sortOrder), asc(locations.id));
      const shelfRows = await this.shelvesOf(tx, householdId);
      const counts = await this.productCounts(tx, householdId);
      return locationRows.map((row) => toLocation(row, shelfRows, counts.get(row.id) ?? 0));
    });
  }

  /**
   * Creates a piece of furniture with the default shelves of its kind (D6: 12 per household, 8
   * shelves each, a name not used yet whatever its case). It comes last in the order.
   */
  async createLocation(input: LocationCreateInput): Promise<LocationDto> {
    try {
      return await this.tenant.run(async (tx, householdId) => {
        // One creation at a time per household: the limit cannot be passed by two requests. NO KEY
        // UPDATE does not block the foreign key checks of the other writes of the household.
        await tx
          .select({ id: households.id })
          .from(households)
          .where(eq(households.id, householdId))
          .for('no key update');
        const [existing] = await tx
          .select({ n: count(), top: max(locations.sortOrder) })
          .from(locations)
          .where(eq(locations.householdId, householdId));
        if ((existing?.n ?? 0) >= MAX_LOCATIONS_PER_HOUSEHOLD) {
          throw new ConflictException(TOO_MANY_LOCATIONS);
        }
        const [row] = await tx
          .insert(locations)
          .values({
            householdId,
            name: input.name,
            kind: input.kind,
            icon: LOCATION_KIND_DEFAULTS[input.kind].icon,
            sortOrder: (existing?.top ?? -1) + 1,
          })
          .returning();
        await tx.insert(shelves).values(
          defaultShelves(input.kind, input.shelfCount).map((shelf, order) => ({
            householdId,
            locationId: row!.id,
            name: shelf.name,
            kind: shelf.kind,
            sortOrder: order,
          })),
        );
        return toLocation(row!, await this.shelvesOf(tx, householdId, row!.id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(LOCATION_NAME_TAKEN);
      throw error;
    }
  }

  /**
   * Deletes a piece of furniture and its shelves. When it holds stock, `moveStockTo` (another piece
   * of furniture of the household) is mandatory: every line goes to its « Non rangé » tray, merged
   * with an identical line already there, with two `move` movements each. Products whose default
   * location it was get none. One transaction; the journal keeps the names (instantané).
   */
  async deleteLocation(id: number, moveStockTo: number | undefined, userId: number): Promise<void> {
    if (moveStockTo === id) {
      throw new BadRequestException('Choisissez un autre meuble pour recevoir les produits.');
    }
    await this.tenant.run(async (tx, householdId) => {
      // Locks in a fixed order: two deletions that move stock into each other cannot deadlock.
      for (const locationId of [id, moveStockTo]
        .filter((v): v is number => v !== undefined)
        .sort((x, y) => x - y)) {
        await this.lockLocation(tx, householdId, locationId);
      }
      const lines = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.locationId, id), eq(stockItems.householdId, householdId)))
        .orderBy(asc(stockItems.id))
        .for('update');
      if (lines.length > 0 && moveStockTo === undefined) {
        throw new ConflictException(STOCK_NEEDS_DESTINATION);
      }
      for (const line of lines) {
        const target = moveStockTo as number;
        await lockProductLocation(tx, line.productId, target);
        const from = await placeNames(tx, householdId, line.locationId, line.shelfId);
        const to = await placeNames(tx, householdId, target, null);
        await this.mergeIntoTray(tx, householdId, line, target);
        const base = {
          householdId,
          productId: line.productId,
          expiryDate: line.expiryDate,
          reason: 'move',
          userId,
        };
        await tx.insert(stockMovements).values([
          {
            ...base,
            locationId: line.locationId,
            shelfId: line.shelfId,
            ...from,
            delta: -line.quantity,
          },
          { ...base, locationId: target, shelfId: null, ...to, delta: line.quantity },
        ]);
      }
      await tx
        .update(products)
        .set({ defaultLocationId: null })
        .where(and(eq(products.householdId, householdId), eq(products.defaultLocationId, id)));
      // Shelves go with it (cascade); the journal keeps the plain ids and the names.
      await tx
        .delete(locations)
        .where(and(eq(locations.id, id), eq(locations.householdId, householdId)));
    });
  }

  /** Distinct products in stock, per location of the household. */
  protected async productCounts(
    tx: Transaction,
    householdId: number,
  ): Promise<Map<number, number>> {
    const rows = await tx
      .select({
        locationId: stockItems.locationId,
        n: sql<number>`count(distinct ${stockItems.productId})::int`,
      })
      .from(stockItems)
      .where(eq(stockItems.householdId, householdId))
      .groupBy(stockItems.locationId);
    return new Map(rows.map((r) => [r.locationId, r.n]));
  }

  /**
   * Number of pieces of furniture of a household, for the admin console: a count only, read in that
   * household's transaction (its content is never read).
   */
  async countIn(householdId: number): Promise<number> {
    return this.tenant.forHousehold(householdId, async (tx, hid) => {
      const [row] = await tx
        .select({ n: count() })
        .from(locations)
        .where(eq(locations.householdId, hid));
      return row?.n ?? 0;
    });
  }

  async updateLocation(id: number, patch: LocationPatch): Promise<LocationDto> {
    try {
      return await this.tenant.run(async (tx, householdId) => {
        const [row] = await tx
          .update(locations)
          .set(patch)
          .where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
          .returning();
        if (!row) throw new NotFoundException('Lieu introuvable');
        const counts = await this.productCounts(tx, householdId);
        return toLocation(row, await this.shelvesOf(tx, householdId, id), counts.get(id) ?? 0);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(LOCATION_NAME_TAKEN);
      throw error;
    }
  }

  async createShelf(input: ShelfInput): Promise<ShelfDto> {
    return this.tenant.run(async (tx, householdId) => {
      await this.lockLocation(tx, householdId, input.locationId);
      await this.assertRoomForShelf(tx, householdId, input.locationId);
      const sortOrder =
        input.sortOrder ?? (await this.nextShelfOrder(tx, householdId, input.locationId));
      const [row] = await tx
        .insert(shelves)
        .values({
          householdId,
          locationId: input.locationId,
          name: input.name,
          kind: input.kind,
          sortOrder,
        })
        .returning();
      return toShelf(row!);
    });
  }

  async updateShelf(id: number, patch: ShelfPatch): Promise<ShelfDto> {
    return this.tenant.run(async (tx, householdId) => {
      const [current] = await tx
        .select()
        .from(shelves)
        .where(and(eq(shelves.id, id), eq(shelves.householdId, householdId)))
        .for('update');
      if (!current) throw new NotFoundException('Étagère introuvable');

      const movesLocation =
        patch.locationId !== undefined && patch.locationId !== current.locationId;
      if (movesLocation) {
        await this.lockLocation(tx, householdId, patch.locationId as number);
        await this.assertRoomForShelf(tx, householdId, patch.locationId as number);
        // A stock line is tied to the location of its shelf: only an empty shelf can change furniture.
        const [line] = await tx
          .select({ id: stockItems.id })
          .from(stockItems)
          .where(and(eq(stockItems.shelfId, id), eq(stockItems.householdId, householdId)))
          .limit(1);
        if (line) throw new ConflictException('Videz l’étagère avant de la changer de meuble');
        if (patch.sortOrder === undefined) {
          patch = {
            ...patch,
            sortOrder: await this.nextShelfOrder(tx, householdId, patch.locationId as number),
          };
        }
      }
      const [row] = await tx
        .update(shelves)
        .set(patch)
        .where(and(eq(shelves.id, id), eq(shelves.householdId, householdId)))
        .returning();
      return toShelf(row!);
    });
  }

  /**
   * Deletes a shelf. Its stock goes back to the "Non rangé" tray of the same location: lines that
   * already exist there (same product and date) are merged, and every line writes two `move`
   * movements, all in one transaction.
   */
  async deleteShelf(id: number, userId: number): Promise<void> {
    await this.tenant.run(async (tx, householdId) => {
      const [shelf] = await tx
        .select()
        .from(shelves)
        .where(and(eq(shelves.id, id), eq(shelves.householdId, householdId)))
        .for('update');
      if (!shelf) throw new NotFoundException('Étagère introuvable');

      const lines = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.shelfId, id), eq(stockItems.householdId, householdId)))
        .orderBy(asc(stockItems.id))
        .for('update');

      const fromNames = await placeNames(tx, householdId, shelf.locationId, id);
      for (const line of lines) {
        await this.mergeIntoTray(tx, householdId, line, line.locationId);
        const base = {
          householdId,
          productId: line.productId,
          locationId: line.locationId,
          locationName: fromNames.locationName,
          expiryDate: line.expiryDate,
          reason: 'move',
          userId,
        };
        await tx.insert(stockMovements).values([
          { ...base, shelfId: id, shelfName: fromNames.shelfName, delta: -line.quantity },
          { ...base, shelfId: null, shelfName: null, delta: line.quantity },
        ]);
      }

      // The journal is never modified: its rows keep the id and the name of the deleted shelf.
      await tx.delete(shelves).where(and(eq(shelves.id, id), eq(shelves.householdId, householdId)));
    });
  }

  /**
   * Puts a stock line into the "Non rangé" tray of `locationId`, merged with the identical line
   * (same product, same date) already there. The movements are written by the caller.
   */
  protected async mergeIntoTray(
    tx: Transaction,
    householdId: number,
    line: typeof stockItems.$inferSelect,
    locationId: number,
  ): Promise<void> {
    const [target] = await tx
      .select()
      .from(stockItems)
      .where(
        and(
          eq(stockItems.householdId, householdId),
          eq(stockItems.productId, line.productId),
          eq(stockItems.locationId, locationId),
          isNull(stockItems.shelfId),
          line.expiryDate === null
            ? isNull(stockItems.expiryDate)
            : eq(stockItems.expiryDate, line.expiryDate),
        ),
      )
      .for('update');
    if (target && target.id !== line.id) {
      await tx
        .update(stockItems)
        .set({ quantity: target.quantity + line.quantity, updatedAt: sql`now()` })
        .where(and(eq(stockItems.id, target.id), eq(stockItems.householdId, householdId)));
      await tx
        .delete(stockItems)
        .where(and(eq(stockItems.id, line.id), eq(stockItems.householdId, householdId)));
    } else {
      await tx
        .update(stockItems)
        .set({ locationId, shelfId: null, updatedAt: sql`now()` })
        .where(and(eq(stockItems.id, line.id), eq(stockItems.householdId, householdId)));
    }
  }

  protected async shelvesOf(
    tx: Transaction,
    householdId: number,
    locationId?: number,
  ): Promise<(typeof shelves.$inferSelect)[]> {
    return tx
      .select()
      .from(shelves)
      .where(
        and(
          eq(shelves.householdId, householdId),
          locationId === undefined ? undefined : eq(shelves.locationId, locationId),
        ),
      )
      .orderBy(asc(shelves.sortOrder), asc(shelves.id));
  }

  /** Serialises changes of a location's shelves and checks that the location exists. */
  protected async lockLocation(
    tx: Transaction,
    householdId: number,
    locationId: number,
  ): Promise<typeof locations.$inferSelect> {
    const [row] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)))
      .for('update');
    if (!row) throw new NotFoundException('Lieu introuvable');
    return row;
  }

  /** D6: at most MAX_SHELVES_PER_LOCATION shelves or drawers per piece of furniture. */
  protected async assertRoomForShelf(
    tx: Transaction,
    householdId: number,
    locationId: number,
  ): Promise<void> {
    const [row] = await tx
      .select({ n: count() })
      .from(shelves)
      .where(and(eq(shelves.householdId, householdId), eq(shelves.locationId, locationId)));
    if ((row?.n ?? 0) >= MAX_SHELVES_PER_LOCATION) throw new ConflictException(TOO_MANY_SHELVES);
  }

  protected async nextShelfOrder(
    tx: Transaction,
    householdId: number,
    locationId: number,
  ): Promise<number> {
    const [row] = await tx
      .select({ top: max(shelves.sortOrder) })
      .from(shelves)
      .where(and(eq(shelves.householdId, householdId), eq(shelves.locationId, locationId)));
    return (row?.top ?? -1) + 1;
  }
}
