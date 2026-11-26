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
import type { Transaction } from '../database/database.module';
import { locations, products, shelves, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { syncAutoShopping } from '../shopping/auto-shopping';

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

export interface StockKey {
  productId: number;
  locationId: number;
  shelfId: number | null;
  expiryDate: string | null;
}

/** The line matching a stock identity in the household, locked; null when there is none. */
export async function findLine(
  tx: Transaction,
  householdId: number,
  key: StockKey,
): Promise<typeof stockItems.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(stockItems)
    .where(
      and(
        eq(stockItems.householdId, householdId),
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

/** Names written with each movement, so that the history stays readable after a deletion. */
export async function placeNames(
  tx: Transaction,
  householdId: number,
  locationId: number,
  shelfId: number | null,
): Promise<{ locationName: string; shelfName: string | null }> {
  const [location] = await tx
    .select({ name: locations.name })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)));
  const [shelf] =
    shelfId === null
      ? []
      : await tx
          .select({ name: shelves.name })
          .from(shelves)
          .where(and(eq(shelves.id, shelfId), eq(shelves.householdId, householdId)));
  return { locationName: location?.name ?? '', shelfName: shelf?.name ?? null };
}

/** True when the shelf exists in the household and belongs to the location. */
export async function shelfBelongs(
  tx: Transaction,
  householdId: number,
  shelfId: number,
  locationId: number,
): Promise<boolean> {
  const [shelf] = await tx
    .select({ locationId: shelves.locationId })
    .from(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.householdId, householdId)));
  return shelf?.locationId === locationId;
}

@Injectable()
export class StockService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  async adjust(input: StockAdjustInput, userId: number): Promise<StockAdjustResponse> {
    const shelfId = input.shelfId ?? null;
    const expiryDate = input.expiryDate ?? null;
    if (input.delta === 0) throw new BadRequestException('La quantité ne peut pas être nulle');
    // The reason must agree with the direction of the movement, or the journal would lie. A
    // positive `consumed` or `wasted` is the undo of that removal: statistics net it out.
    if (
      (input.reason === 'scan_add' && input.delta < 0) ||
      (input.reason === 'scan_remove' && input.delta > 0)
    ) {
      throw new BadRequestException('La raison ne correspond pas au sens du mouvement');
    }

    return this.tenant.run(async (tx, householdId) => {
      const [product] = await tx
        .select({ id: products.id, defaultLocationId: products.defaultLocationId })
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.householdId, householdId)));
      if (!product) throw new NotFoundException('Produit introuvable');
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, input.locationId), eq(locations.householdId, householdId)));
      if (!location) throw new NotFoundException('Lieu introuvable');
      if (shelfId !== null && !(await shelfBelongs(tx, householdId, shelfId, input.locationId))) {
        throw new BadRequestException('Cette étagère n’appartient pas à ce lieu');
      }

      await lockProductLocation(tx, input.productId, input.locationId);
      const key = { productId: input.productId, locationId: input.locationId, shelfId, expiryDate };
      const current = await findLine(tx, householdId, key);

      let item: typeof stockItems.$inferSelect | null | undefined;
      if (input.delta > 0) {
        if (current) {
          [item] = await tx
            .update(stockItems)
            .set({ quantity: current.quantity + input.delta, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, current.id), eq(stockItems.householdId, householdId)))
            .returning();
        } else {
          [item] = await tx
            .insert(stockItems)
            .values({ ...key, householdId, quantity: input.delta })
            .returning();
        }
        if (product.defaultLocationId === null) {
          await tx
            .update(products)
            .set({ defaultLocationId: input.locationId })
            .where(and(eq(products.id, product.id), eq(products.householdId, householdId)));
        }
      } else {
        const remaining = (current?.quantity ?? 0) + input.delta;
        if (!current || remaining < 0) throw new ConflictException(INSUFFICIENT_STOCK);
        if (remaining === 0) {
          await tx
            .delete(stockItems)
            .where(and(eq(stockItems.id, current.id), eq(stockItems.householdId, householdId)));
          item = null;
        } else {
          [item] = await tx
            .update(stockItems)
            .set({ quantity: remaining, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, current.id), eq(stockItems.householdId, householdId)))
            .returning();
        }
      }

      const names = await placeNames(tx, householdId, input.locationId, shelfId);
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          ...key,
          ...names,
          householdId,
          delta: input.delta,
          reason: input.reason,
          userId,
        })
        .returning();
      await syncAutoShopping(tx, householdId, input.productId);
      return { item: item ? toStockLine(item) : null, movement: toMovement(movement!) };
    });
  }
}
