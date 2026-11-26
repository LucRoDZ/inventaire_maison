import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_REMOVAL_REASON,
  IDEMPOTENCY_TTL_DAYS,
  SHOPPING_QUANTITY_MAX,
  type CatalogCacheEntry,
  type SyncOp,
  type SyncResult,
} from '@inventaire/shared';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import type { Transaction } from '../database/database.module';
import {
  idempotencyKeys,
  locations,
  products,
  shoppingItems,
  stockItems,
} from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { productStatus } from '../stock/product-status';
import { StockRemoveService } from '../stock/stock-remove.service';
import { StockService, shelfBelongs } from '../stock/stock.service';

/** Thrown inside an operation's transaction to roll it back (key included) with a result. */
class Abort extends Error {
  constructor(readonly result: SyncResult) {
    super('sync abort');
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SyncService {
  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(StockRemoveService) private readonly remover: StockRemoveService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Applies the operations in order, each in its own transaction. */
  async apply(ops: SyncOp[], userId: number): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const op of ops) results.push(await this.applyOne(op, userId));
    return results;
  }

  private async applyOne(op: SyncOp, userId: number): Promise<SyncResult> {
    try {
      return await this.tenant.run(async (tx, householdId): Promise<SyncResult> => {
        // The key first: a concurrent replay waits for this transaction, then sees the row.
        const inserted = await tx
          .insert(idempotencyKeys)
          .values({
            householdId,
            key: op.key,
            deviceId: op.deviceId,
            result: { status: 'applied' },
          })
          .onConflictDoNothing()
          .returning({ key: idempotencyKeys.key });
        if (inserted.length === 0) return { key: op.key, status: 'duplicate', first: 'applied' };
        await this.run(tx, householdId, op, userId);
        return { key: op.key, status: 'applied' };
      });
    } catch (error) {
      if (error instanceof Abort) return error.result;
      throw error;
    }
  }

  private async run(
    tx: Transaction,
    householdId: number,
    op: SyncOp,
    userId: number,
  ): Promise<void> {
    const reject = (message: string): never => {
      throw new Abort({ key: op.key, status: 'rejected', message });
    };
    const [product] = await tx
      .select({
        id: products.id,
        defaultLocationId: products.defaultLocationId,
        mergedIntoId: products.mergedIntoId,
      })
      .from(products)
      .where(and(eq(products.id, op.productId), eq(products.householdId, householdId)));
    if (!product) return reject('Produit introuvable');
    if (product.mergedIntoId !== null) {
      throw new Abort({
        key: op.key,
        status: 'conflict',
        conflict: 'merged',
        mergedIntoId: product.mergedIntoId,
      });
    }

    if (op.kind === 'add') {
      const locationId = op.locationId ?? product.defaultLocationId;
      if (locationId === null || locationId === undefined) {
        throw new Abort({ key: op.key, status: 'conflict', conflict: 'no_location' });
      }
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), eq(locations.householdId, householdId)));
      if (!location) return reject('Lieu introuvable');
      const shelfId = op.shelfId ?? null;
      if (shelfId !== null && !(await shelfBelongs(tx, householdId, shelfId, locationId))) {
        return reject('Cette étagère n’appartient pas à ce lieu');
      }
      await this.stock.adjust(
        {
          productId: op.productId,
          locationId,
          shelfId,
          expiryDate: op.expiryDate ?? null,
          delta: op.quantity,
          reason: 'scan_add',
        },
        userId,
      );
      return;
    }

    if (op.kind === 'shop') {
      const { onShoppingList } = await productStatus(tx, householdId, op.productId);
      if (!onShoppingList) {
        await tx.insert(shoppingItems).values({
          householdId,
          productId: op.productId,
          quantity: op.quantity,
          createdBy: userId,
        });
      }
      return;
    }

    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${stockItems.quantity}), 0)::int` })
      .from(stockItems)
      .where(and(eq(stockItems.productId, op.productId), eq(stockItems.householdId, householdId)));
    if ((row?.total ?? 0) < op.quantity) {
      throw new Abort({ key: op.key, status: 'conflict', conflict: 'insufficient_stock' });
    }
    for (let i = 0; i < op.quantity; i += 1) {
      await this.remover.removeOne(op.productId, userId, op.reason ?? DEFAULT_REMOVAL_REASON);
    }
  }

  /** Products the device can scan offline (merged ones excluded). */
  catalog(): Promise<CatalogCacheEntry[]> {
    return this.tenant.run((tx, householdId) =>
      tx
        .select({
          id: products.id,
          name: products.name,
          barcode: products.barcode,
          defaultLocationId: products.defaultLocationId,
        })
        .from(products)
        .where(and(eq(products.householdId, householdId), isNull(products.mergedIntoId)))
        .orderBy(asc(products.id)),
    );
  }

  /** Deletes the keys older than the retention period in one household; returns how many. */
  purgeExpired(householdId: number): Promise<number> {
    const limit = new Date(this.clock.now().getTime() - IDEMPOTENCY_TTL_DAYS * DAY_MS);
    return this.tenant.forHousehold(householdId, async (tx, hid) => {
      const rows = await tx
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.householdId, hid), lt(idempotencyKeys.createdAt, limit)))
        .returning({ key: idempotencyKeys.key });
      return rows.length;
    });
  }
}
