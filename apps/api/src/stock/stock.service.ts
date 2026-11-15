import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MovementReason,
  StockAdjustInput,
  StockAdjustResponse,
  StockLineDto,
  StockMovementDto,
} from '@inventaire/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Database, type Transaction } from '../database/database.module';
import { locations, products, shelves, stockItems, stockMovements } from '../database/schema';

export const toStockLine = (row: typeof stockItems.$inferSelect): StockLineDto => ({
  id: row.id,
  productId: row.productId,
  locationId: row.locationId,
  shelfId: row.shelfId,
  quantity: row.quantity,
  expiryDate: row.expiryDate,
});

export const toMovement = (row: typeof stockMovements.$inferSelect): StockMovementDto => ({
  id: row.id,
  productId: row.productId,
  locationId: row.locationId,
  shelfId: row.shelfId,
  expiryDate: row.expiryDate,
  delta: row.delta,
  reason: row.reason as MovementReason,
  userId: row.userId,
  createdAt: row.createdAt.toISOString(),
});

export const INSUFFICIENT_STOCK = 'Stock insuffisant';

/** Serialises every change of one product in one location (lines are created and deleted). */
export async function lockProductLocation(
  tx: Transaction,
  productId: number,
  locationId: number,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${productId}::int, ${locationId}::int)`);
}

/** The line matching a stock identity, locked; null when there is none. */
export async function findLine(
  tx: Transaction,
  key: { productId: number; locationId: number; shelfId: number | null; expiryDate: string | null },
): Promise<typeof stockItems.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(stockItems)
    .where(
      and(
        eq(stockItems.productId, key.productId),
        eq(stockItems.locationId, key.locationId),
        key.shelfId === null ? isNull(stockItems.shelfId) : eq(stockItems.shelfId, key.shelfId),
        key.expiryDate === null
          ? isNull(stockItems.expiryDate)
          : eq(stockItems.expiryDate, key.expiryDate),
      ),
    )
    .for('update');
  return row ?? null;
}

@Injectable()
export class StockService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async adjust(input: StockAdjustInput, userId: number): Promise<StockAdjustResponse> {
    const shelfId = input.shelfId ?? null;
    const expiryDate = input.expiryDate ?? null;
    if (input.delta === 0) throw new BadRequestException('La quantité ne peut pas être nulle');

    return this.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, defaultLocationId: products.defaultLocationId })
        .from(products)
        .where(eq(products.id, input.productId));
      if (!product) throw new NotFoundException('Produit introuvable');
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, input.locationId));
      if (!location) throw new NotFoundException('Lieu introuvable');
      if (shelfId !== null) {
        const [shelf] = await tx
          .select({ locationId: shelves.locationId })
          .from(shelves)
          .where(eq(shelves.id, shelfId));
        if (!shelf || shelf.locationId !== input.locationId) {
          throw new BadRequestException('Cette étagère n’appartient pas à ce lieu');
        }
      }

      await lockProductLocation(tx, input.productId, input.locationId);
      const key = { productId: input.productId, locationId: input.locationId, shelfId, expiryDate };
      const current = await findLine(tx, key);

      let item: typeof stockItems.$inferSelect | null | undefined;
      if (input.delta > 0) {
        if (current) {
          [item] = await tx
            .update(stockItems)
            .set({ quantity: current.quantity + input.delta, updatedAt: sql`now()` })
            .where(eq(stockItems.id, current.id))
            .returning();
        } else {
          [item] = await tx
            .insert(stockItems)
            .values({ ...key, quantity: input.delta })
            .returning();
        }
        if (product.defaultLocationId === null) {
          await tx
            .update(products)
            .set({ defaultLocationId: input.locationId })
            .where(eq(products.id, product.id));
        }
      } else {
        const remaining = (current?.quantity ?? 0) + input.delta;
        if (!current || remaining < 0) throw new ConflictException(INSUFFICIENT_STOCK);
        if (remaining === 0) {
          await tx.delete(stockItems).where(eq(stockItems.id, current.id));
          item = null;
        } else {
          [item] = await tx
            .update(stockItems)
            .set({ quantity: remaining, updatedAt: sql`now()` })
            .where(eq(stockItems.id, current.id))
            .returning();
        }
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({ ...key, delta: input.delta, reason: input.reason, userId })
        .returning();
      return { item: item ? toStockLine(item) : null, movement: toMovement(movement!) };
    });
  }
}
