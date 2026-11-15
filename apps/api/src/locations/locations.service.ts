import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LocationDto, ShelfDto, ShelfKind } from '@inventaire/shared';
import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';
import { DB, type Database, type Transaction } from '../database/database.module';
import { locations, shelves, stockItems, stockMovements } from '../database/schema';

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

function toShelf(row: typeof shelves.$inferSelect): ShelfDto {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    kind: row.kind as ShelfKind,
    sortOrder: row.sortOrder,
  };
}

@Injectable()
export class LocationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<LocationDto[]> {
    const [locationRows, shelfRows] = await Promise.all([
      this.db.select().from(locations).orderBy(asc(locations.sortOrder), asc(locations.id)),
      this.db.select().from(shelves).orderBy(asc(shelves.sortOrder), asc(shelves.id)),
    ]);
    return locationRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as LocationDto['kind'],
      icon: row.icon,
      sortOrder: row.sortOrder,
      shelves: shelfRows.filter((s) => s.locationId === row.id).map(toShelf),
    }));
  }

  async updateLocation(id: number, patch: LocationPatch): Promise<LocationDto> {
    const [row] = await this.db
      .update(locations)
      .set(patch)
      .where(eq(locations.id, id))
      .returning();
    if (!row) throw new NotFoundException('Lieu introuvable');
    const shelfRows = await this.db
      .select()
      .from(shelves)
      .where(eq(shelves.locationId, id))
      .orderBy(asc(shelves.sortOrder), asc(shelves.id));
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as LocationDto['kind'],
      icon: row.icon,
      sortOrder: row.sortOrder,
      shelves: shelfRows.map(toShelf),
    };
  }

  async createShelf(input: ShelfInput): Promise<ShelfDto> {
    return this.db.transaction(async (tx) => {
      await this.lockLocation(tx, input.locationId);
      const sortOrder = input.sortOrder ?? (await this.nextShelfOrder(tx, input.locationId));
      const [row] = await tx
        .insert(shelves)
        .values({ locationId: input.locationId, name: input.name, kind: input.kind, sortOrder })
        .returning();
      return toShelf(row!);
    });
  }

  async updateShelf(id: number, patch: ShelfPatch): Promise<ShelfDto> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(shelves).where(eq(shelves.id, id)).for('update');
      if (!current) throw new NotFoundException('Étagère introuvable');

      const movesLocation =
        patch.locationId !== undefined && patch.locationId !== current.locationId;
      if (movesLocation) {
        await this.lockLocation(tx, patch.locationId as number);
        // A stock line is tied to the location of its shelf: only an empty shelf can change furniture.
        const [line] = await tx
          .select({ id: stockItems.id })
          .from(stockItems)
          .where(eq(stockItems.shelfId, id))
          .limit(1);
        if (line) throw new ConflictException('Videz l’étagère avant de la changer de meuble');
        if (patch.sortOrder === undefined) {
          patch = {
            ...patch,
            sortOrder: await this.nextShelfOrder(tx, patch.locationId as number),
          };
        }
      }
      const [row] = await tx.update(shelves).set(patch).where(eq(shelves.id, id)).returning();
      return toShelf(row!);
    });
  }

  /**
   * Deletes a shelf. Its stock goes back to the "Non rangé" tray of the same location: lines that
   * already exist there (same product and date) are merged, and every line writes two `move`
   * movements, all in one transaction.
   */
  async deleteShelf(id: number, userId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [shelf] = await tx.select().from(shelves).where(eq(shelves.id, id)).for('update');
      if (!shelf) throw new NotFoundException('Étagère introuvable');

      const lines = await tx
        .select()
        .from(stockItems)
        .where(eq(stockItems.shelfId, id))
        .orderBy(asc(stockItems.id))
        .for('update');

      for (const line of lines) {
        const [target] = await tx
          .select()
          .from(stockItems)
          .where(
            and(
              eq(stockItems.productId, line.productId),
              eq(stockItems.locationId, line.locationId),
              isNull(stockItems.shelfId),
              line.expiryDate === null
                ? isNull(stockItems.expiryDate)
                : eq(stockItems.expiryDate, line.expiryDate),
            ),
          )
          .for('update');
        if (target) {
          await tx
            .update(stockItems)
            .set({ quantity: target.quantity + line.quantity, updatedAt: sql`now()` })
            .where(eq(stockItems.id, target.id));
          await tx.delete(stockItems).where(eq(stockItems.id, line.id));
        } else {
          await tx
            .update(stockItems)
            .set({ shelfId: null, updatedAt: sql`now()` })
            .where(eq(stockItems.id, line.id));
        }
        const base = {
          productId: line.productId,
          locationId: line.locationId,
          expiryDate: line.expiryDate,
          reason: 'move',
          userId,
        };
        await tx.insert(stockMovements).values([
          { ...base, shelfId: id, delta: -line.quantity },
          { ...base, shelfId: null, delta: line.quantity },
        ]);
      }

      // The journal keeps its rows; they just stop pointing at a shelf that no longer exists.
      await tx.update(stockMovements).set({ shelfId: null }).where(eq(stockMovements.shelfId, id));
      await tx.delete(shelves).where(eq(shelves.id, id));
    });
  }

  /** Serialises changes of a location's shelves and checks that the location exists. */
  private async lockLocation(tx: Transaction, locationId: number): Promise<void> {
    const [row] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locationId))
      .for('update');
    if (!row) {
      throw new NotFoundException('Lieu introuvable');
    }
  }

  private async nextShelfOrder(tx: Transaction, locationId: number): Promise<number> {
    const [row] = await tx
      .select({ top: max(shelves.sortOrder) })
      .from(shelves)
      .where(eq(shelves.locationId, locationId));
    return (row?.top ?? -1) + 1;
  }
}
