import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MovementHistoryResponse, MovementReason } from '@inventaire/shared';
import { desc, eq, lt, and } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { locations, products, shelves, stockMovements, users } from '../database/schema';

@Injectable()
export class MovementHistoryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Newest first; the cursor is the id of the last movement of the previous page. */
  async list(
    productId: number,
    page: { cursor?: number; limit: number },
  ): Promise<MovementHistoryResponse> {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw new NotFoundException('Produit introuvable');

    const rows = await this.db
      .select({
        id: stockMovements.id,
        delta: stockMovements.delta,
        reason: stockMovements.reason,
        expiryDate: stockMovements.expiryDate,
        createdAt: stockMovements.createdAt,
        userId: users.id,
        username: users.username,
        locationId: locations.id,
        locationName: locations.name,
        shelfId: shelves.id,
        shelfName: shelves.name,
      })
      .from(stockMovements)
      .innerJoin(users, eq(users.id, stockMovements.userId))
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .leftJoin(shelves, eq(shelves.id, stockMovements.shelfId))
      .where(
        and(
          eq(stockMovements.productId, productId),
          page.cursor === undefined ? undefined : lt(stockMovements.id, page.cursor),
        ),
      )
      .orderBy(desc(stockMovements.id))
      .limit(page.limit + 1);

    const pageRows = rows.slice(0, page.limit);
    return {
      items: pageRows.map((r) => ({
        id: r.id,
        delta: r.delta,
        reason: r.reason as MovementReason,
        expiryDate: r.expiryDate,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.userId, username: r.username },
        location: { id: r.locationId, name: r.locationName },
        shelf: r.shelfId === null ? null : { id: r.shelfId, name: r.shelfName! },
      })),
      nextCursor: rows.length > page.limit ? String(pageRows[pageRows.length - 1]!.id) : null,
    };
  }
}
