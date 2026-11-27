import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_REMOVAL_REASON,
  type RemovalReason,
  type StockRemoveResponse,
} from '@inventaire/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { locations, products, shelves, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { syncAutoShopping } from '../shopping/auto-shopping';
import { productStatus } from './product-status';
import {
  findLine,
  lockProductLocation,
  placeNames,
  toMovement,
  toStockLine,
} from './stock.service';

export const NOT_IN_STOCK = 'Pas en stock';
const MAX_ATTEMPTS = 5;

@Injectable()
export class StockRemoveService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  /** Removes one unit (eaten by default, or thrown away): nearest expiry date first, then the oldest line. */
  async removeOne(
    productId: number,
    userId: number,
    reason: RemovalReason = DEFAULT_REMOVAL_REASON,
  ): Promise<StockRemoveResponse> {
    return this.tenant.run(async (tx, householdId) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const [candidate] = await tx
          .select()
          .from(stockItems)
          .where(and(eq(stockItems.productId, productId), eq(stockItems.householdId, householdId)))
          .orderBy(
            sql`${stockItems.expiryDate} asc nulls last`,
            asc(stockItems.createdAt),
            asc(stockItems.id),
          )
          .limit(1);
        if (!candidate) throw new NotFoundException(NOT_IN_STOCK);

        await lockProductLocation(tx, productId, candidate.locationId);
        const line = await findLine(tx, householdId, candidate);
        if (!line) continue; // consumed by a concurrent change: choose again

        let item: typeof stockItems.$inferSelect | null = null;
        if (line.quantity === 1) {
          await tx
            .delete(stockItems)
            .where(and(eq(stockItems.id, line.id), eq(stockItems.householdId, householdId)));
        } else {
          [item = null] = await tx
            .update(stockItems)
            .set({ quantity: line.quantity - 1, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, line.id), eq(stockItems.householdId, householdId)))
            .returning();
        }
        const names = await placeNames(tx, householdId, line.locationId, line.shelfId);
        const [movement] = await tx
          .insert(stockMovements)
          .values({
            householdId,
            productId,
            locationId: line.locationId,
            shelfId: line.shelfId,
            ...names,
            expiryDate: line.expiryDate,
            delta: -1,
            reason,
            userId,
          })
          .returning();

        await syncAutoShopping(tx, householdId, productId);
        const status = await productStatus(tx, householdId, productId);
        const [product] = await tx
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.id, productId), eq(products.householdId, householdId)));
        const [location] = await tx
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(and(eq(locations.id, line.locationId), eq(locations.householdId, householdId)));
        const [shelf] =
          line.shelfId === null
            ? []
            : await tx
                .select({ id: shelves.id, name: shelves.name })
                .from(shelves)
                .where(and(eq(shelves.id, line.shelfId), eq(shelves.householdId, householdId)));
        return {
          item: item ? toStockLine(item) : null,
          movement: toMovement(movement!),
          product: product!,
          location: location!,
          shelf: shelf ?? null,
          ...status,
        };
      }
      throw new NotFoundException(NOT_IN_STOCK);
    });
  }
}
