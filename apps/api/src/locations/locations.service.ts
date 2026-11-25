import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LocationDto, ShelfDto, ShelfKind } from '@inventaire/shared';
import { and, asc, count, eq, isNull, max, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/pg-errors';
import type { Transaction } from '../database/database.module';
import { locations, shelves, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { placeNames } from '../stock/stock.service';

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
): LocationDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as LocationDto['kind'],
    icon: row.icon,
    sortOrder: row.sortOrder,
    shelves: shelfRows.filter((s) => s.locationId === row.id).map(toShelf),
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
      return locationRows.map((row) => toLocation(row, shelfRows));
    });
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
        return toLocation(row, await this.shelvesOf(tx, householdId, id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(LOCATION_NAME_TAKEN);
      throw error;
    }
  }

  async createShelf(input: ShelfInput): Promise<ShelfDto> {
    return this.tenant.run(async (tx, householdId) => {
      await this.lockLocation(tx, householdId, input.locationId);
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
