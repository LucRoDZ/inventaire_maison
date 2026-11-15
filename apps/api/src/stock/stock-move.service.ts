import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StockMoveInput, StockMoveResponse } from '@inventaire/shared';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { locations, shelves, stockItems, stockMovements } from '../database/schema';
import {
  findLine,
  INSUFFICIENT_STOCK,
  lockProductLocation,
  toMovement,
  toStockLine,
} from './stock.service';

@Injectable()
export class StockMoveService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async move(input: StockMoveInput, userId: number): Promise<StockMoveResponse> {
    const toShelfId = input.toShelfId ?? null;

    return this.db.transaction(async (tx) => {
      const [probe] = await tx
        .select()
        .from(stockItems)
        .where(eq(stockItems.id, input.stockItemId));
      if (!probe) throw new NotFoundException('Ligne de stock introuvable');

      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, input.toLocationId));
      if (!location) throw new NotFoundException('Lieu introuvable');
      if (toShelfId !== null) {
        const [shelf] = await tx
          .select({ locationId: shelves.locationId })
          .from(shelves)
          .where(eq(shelves.id, toShelfId));
        if (!shelf || shelf.locationId !== input.toLocationId) {
          throw new BadRequestException('Cette étagère n’appartient pas à ce lieu');
        }
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

      const source = await findLine(tx, probe);
      if (!source) throw new NotFoundException('Ligne de stock introuvable');
      if (input.quantity > source.quantity) throw new ConflictException(INSUFFICIENT_STOCK);

      const remaining = source.quantity - input.quantity;
      let from: typeof stockItems.$inferSelect | null = null;
      if (remaining === 0) {
        await tx.delete(stockItems).where(eq(stockItems.id, source.id));
      } else {
        [from = null] = await tx
          .update(stockItems)
          .set({ quantity: remaining, updatedAt: sql`now()` })
          .where(eq(stockItems.id, source.id))
          .returning();
      }

      const destKey = {
        productId: source.productId,
        locationId: input.toLocationId,
        shelfId: toShelfId,
        expiryDate: source.expiryDate,
      };
      const existing = await findLine(tx, destKey);
      const [to] = existing
        ? await tx
            .update(stockItems)
            .set({ quantity: existing.quantity + input.quantity, updatedAt: sql`now()` })
            .where(eq(stockItems.id, existing.id))
            .returning()
        : await tx
            .insert(stockItems)
            .values({ ...destKey, quantity: input.quantity })
            .returning();

      const [out, into] = await tx
        .insert(stockMovements)
        .values([
          {
            productId: source.productId,
            locationId: source.locationId,
            shelfId: source.shelfId,
            expiryDate: source.expiryDate,
            delta: -input.quantity,
            reason: 'move',
            userId,
          },
          { ...destKey, delta: input.quantity, reason: 'move', userId },
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
