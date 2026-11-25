import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MovementHistoryResponse, MovementReason } from '@inventaire/shared';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { locations, products, shelves, stockMovements, users } from '../database/schema';
import { TenantDb } from '../database/tenant-db';

@Injectable()
export class MovementHistoryService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  /**
   * Newest first; the cursor is the id of the last movement of the previous page. A location or a
   * shelf deleted since keeps the name written with the movement; one still there shows its
   * current name.
   */
  async list(
    productId: number,
    page: { cursor?: number; limit: number },
  ): Promise<MovementHistoryResponse> {
    return this.tenant.run(async (tx, householdId) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.householdId, householdId)));
      if (!product) throw new NotFoundException('Produit introuvable');

      const rows = await tx
        .select({
          id: stockMovements.id,
          delta: stockMovements.delta,
          reason: stockMovements.reason,
          expiryDate: stockMovements.expiryDate,
          createdAt: stockMovements.createdAt,
          // Accounts are kept (disabled, never deleted): the pseudo of the author is always known.
          userId: users.id,
          username: users.username,
          locationId: stockMovements.locationId,
          locationName: sql<string>`coalesce(${locations.name}, ${stockMovements.locationName})`,
          shelfId: stockMovements.shelfId,
          shelfName: sql<string | null>`coalesce(${shelves.name}, ${stockMovements.shelfName})`,
        })
        .from(stockMovements)
        .innerJoin(users, eq(users.id, stockMovements.userId))
        .leftJoin(
          locations,
          and(eq(locations.id, stockMovements.locationId), eq(locations.householdId, householdId)),
        )
        .leftJoin(
          shelves,
          and(eq(shelves.id, stockMovements.shelfId), eq(shelves.householdId, householdId)),
        )
        .where(
          and(
            eq(stockMovements.householdId, householdId),
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
          // A shelf deleted before its name was kept: still a shelf, not the tray.
          shelf: r.shelfId === null ? null : { id: r.shelfId, name: r.shelfName ?? '' },
        })),
        nextCursor: rows.length > page.limit ? String(pageRows[pageRows.length - 1]!.id) : null,
      };
    });
  }
}
