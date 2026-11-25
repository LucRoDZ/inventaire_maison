import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StockMoveInput, StockMoveResponse } from '@inventaire/shared';
import { and, eq, sql } from 'drizzle-orm';
import { locations, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import {
  findLine,
  INSUFFICIENT_STOCK,
  lockProductLocation,
  placeNames,
  shelfBelongs,
  toMovement,
  toStockLine,
} from './stock.service';

@Injectable()
export class StockMoveService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  async move(input: StockMoveInput, userId: number): Promise<StockMoveResponse> {
    const toShelfId = input.toShelfId ?? null;

    return this.tenant.run(async (tx, householdId) => {
      const [probe] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.id, input.stockItemId), eq(stockItems.householdId, householdId)));
      if (!probe) throw new NotFoundException('Ligne de stock introuvable');

      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, input.toLocationId), eq(locations.householdId, householdId)));
      if (!location) throw new NotFoundException('Lieu introuvable');
      if (
        toShelfId !== null &&
        !(await shelfBelongs(tx, householdId, toShelfId, input.toLocationId))
      ) {
        throw new BadRequestException('Cette étagère n’appartient pas à ce lieu');
      }
      if (probe.locationId === input.toLocationId && probe.shelfId === toShelfId) {
        throw new BadRequestException('La destination est identique à l’origine');
      }

      // Locks are taken in a fixed order so that two opposite moves cannot deadlock.
      for (const locationId of [...new Set([probe.locationId, input.toLocationId])].sort(
        (a, b) => a - b,
      )) {
        await lockProductLocation(tx, probe.productId, locationId);
      }

      const source = await findLine(tx, householdId, probe);
      if (!source) throw new NotFoundException('Ligne de stock introuvable');
      if (input.quantity > source.quantity) throw new ConflictException(INSUFFICIENT_STOCK);

      const remaining = source.quantity - input.quantity;
      let from: typeof stockItems.$inferSelect | null = null;
      if (remaining === 0) {
        await tx
          .delete(stockItems)
          .where(and(eq(stockItems.id, source.id), eq(stockItems.householdId, householdId)));
      } else {
        [from = null] = await tx
          .update(stockItems)
          .set({ quantity: remaining, updatedAt: sql`now()` })
          .where(and(eq(stockItems.id, source.id), eq(stockItems.householdId, householdId)))
          .returning();
      }

      const destKey = {
        productId: source.productId,
        locationId: input.toLocationId,
        shelfId: toShelfId,
        expiryDate: source.expiryDate,
      };
      const existing = await findLine(tx, householdId, destKey);
      const [to] = existing
        ? await tx
            .update(stockItems)
            .set({ quantity: existing.quantity + input.quantity, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, existing.id), eq(stockItems.householdId, householdId)))
            .returning()
        : await tx
            .insert(stockItems)
            .values({ ...destKey, householdId, quantity: input.quantity })
            .returning();

      const fromNames = await placeNames(tx, householdId, source.locationId, source.shelfId);
      const toNames = await placeNames(tx, householdId, input.toLocationId, toShelfId);
      const [out, into] = await tx
        .insert(stockMovements)
        .values([
          {
            householdId,
            productId: source.productId,
            locationId: source.locationId,
            shelfId: source.shelfId,
            ...fromNames,
            expiryDate: source.expiryDate,
            delta: -input.quantity,
            reason: 'move',
            userId,
          },
          { ...destKey, ...toNames, householdId, delta: input.quantity, reason: 'move', userId },
        ])
        .returning();
      return {
        from: from ? toStockLine(from) : null,
        to: toStockLine(to!),
        movements: [toMovement(out!), toMovement(into!)],
      };
    });
  }
}
