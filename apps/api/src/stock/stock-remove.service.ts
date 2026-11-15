import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StockRemoveResponse } from '@inventaire/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { locations, products, shelves, stockItems, stockMovements } from '../database/schema';
import { findLine, lockProductLocation, toMovement, toStockLine } from './stock.service';

export const NOT_IN_STOCK = 'Pas en stock';
const MAX_ATTEMPTS = 5;

@Injectable()
export class StockRemoveService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Removes one unit: nearest expiry date first, then the oldest line. */
  async removeOne(productId: number, userId: number): Promise<StockRemoveResponse> {
    return this.db.transaction(async (tx) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const [candidate] = await tx
          .select()
          .from(stockItems)
          .where(eq(stockItems.productId, productId))
          .orderBy(
            sql`${stockItems.expiryDate} asc nulls last`,
            asc(stockItems.createdAt),
            asc(stockItems.id),
          )
          .limit(1);
        if (!candidate) throw new NotFoundException(NOT_IN_STOCK);

        await lockProductLocation(tx, productId, candidate.locationId);
        const line = await findLine(tx, candidate);
        if (!line) continue; // consumed by a concurrent change: choose again

        let item: typeof stockItems.$inferSelect | null = null;
        if (line.quantity === 1) {
          await tx.delete(stockItems).where(eq(stockItems.id, line.id));
        } else {
          [item = null] = await tx
            .update(stockItems)
            .set({ quantity: line.quantity - 1, updatedAt: sql`now()` })
            .where(eq(stockItems.id, line.id))
            .returning();
        }
        const [movement] = await tx
          .insert(stockMovements)
          .values({
            productId,
            locationId: line.locationId,
            shelfId: line.shelfId,
            expiryDate: line.expiryDate,
            delta: -1,
            reason: 'scan_remove',
            userId,
          })
          .returning();

        const [product] = await tx
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.id, productId));
        const [location] = await tx
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(eq(locations.id, line.locationId));
        const [shelf] =
          line.shelfId === null
            ? []
            : await tx
                .select({ id: shelves.id, name: shelves.name })
                .from(shelves)
                .where(eq(shelves.id, line.shelfId));
        return {
          item: item ? toStockLine(item) : null,
          movement: toMovement(movement!),
          product: product!,
          location: location!,
          shelf: shelf ?? null,
        };
      }
      throw new NotFoundException(NOT_IN_STOCK);
    });
  }
}
