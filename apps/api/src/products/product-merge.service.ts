import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SHOPPING_QUANTITY_MAX,
  type ProductMergeInput,
  type ProductMergeResponse,
} from '@inventaire/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { products, shoppingItems, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { syncAutoShopping } from '../shopping/auto-shopping';
import { findLine, lockProductLocation, placeNames } from '../stock/stock.service';
import { toProductDto } from './products.service';

@Injectable()
export class ProductMergeService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  /** Merges `sourceId` into `input.intoProductId`: its stock, its list lines and its barcode follow. */
  async merge(
    sourceId: number,
    input: ProductMergeInput,
    userId: number,
  ): Promise<ProductMergeResponse> {
    const keptId = input.intoProductId;
    if (keptId === sourceId)
      throw new BadRequestException('Impossible de fusionner un produit avec lui-même');

    return this.tenant.run(async (tx, householdId) => {
      // Both rows locked in id order: two opposite merges cannot deadlock.
      const rows = await tx
        .select()
        .from(products)
        .where(and(eq(products.householdId, householdId), inArray(products.id, [sourceId, keptId])))
        .orderBy(asc(products.id))
        .for('update');
      const source = rows.find((r) => r.id === sourceId);
      const kept = rows.find((r) => r.id === keptId);
      if (!source || !kept) throw new NotFoundException('Produit introuvable');
      if (source.mergedIntoId !== null || kept.mergedIntoId !== null) {
        throw new ConflictException('Un produit déjà fusionné ne peut plus l’être');
      }

      // Stock: each line moves with a pair of correction movements, into the identical line if any.
      const lines = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.productId, sourceId), eq(stockItems.householdId, householdId)))
        .orderBy(asc(stockItems.id));
      let movedUnits = 0;
      for (const line of lines) {
        await lockProductLocation(tx, sourceId, line.locationId);
        await lockProductLocation(tx, keptId, line.locationId);
        const key = {
          locationId: line.locationId,
          shelfId: line.shelfId,
          expiryDate: line.expiryDate,
        };
        const current = await findLine(tx, householdId, { ...key, productId: sourceId });
        if (!current) continue;
        const target = await findLine(tx, householdId, { ...key, productId: keptId });
        await tx
          .delete(stockItems)
          .where(and(eq(stockItems.id, current.id), eq(stockItems.householdId, householdId)));
        if (target) {
          await tx
            .update(stockItems)
            .set({ quantity: target.quantity + current.quantity, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, target.id), eq(stockItems.householdId, householdId)));
        } else {
          await tx
            .insert(stockItems)
            .values({ ...key, householdId, productId: keptId, quantity: current.quantity });
        }
        const names = await placeNames(tx, householdId, line.locationId, line.shelfId);
        await tx.insert(stockMovements).values([
          {
            ...key,
            ...names,
            householdId,
            productId: sourceId,
            delta: -current.quantity,
            reason: 'correction',
            userId,
          },
          {
            ...key,
            ...names,
            householdId,
            productId: keptId,
            delta: current.quantity,
            reason: 'correction',
            userId,
          },
        ]);
        movedUnits += current.quantity;
      }

      // Shopping list: lines move to the kept product; two open lines become one.
      const shopping = await tx
        .select()
        .from(shoppingItems)
        .where(
          and(eq(shoppingItems.productId, sourceId), eq(shoppingItems.householdId, householdId)),
        )
        .orderBy(asc(shoppingItems.id))
        .for('update');
      for (const item of shopping) {
        const [open] = item.checked
          ? []
          : await tx
              .select()
              .from(shoppingItems)
              .where(
                and(
                  eq(shoppingItems.productId, keptId),
                  eq(shoppingItems.householdId, householdId),
                  eq(shoppingItems.checked, false),
                ),
              )
              .for('update');
        if (open) {
          await tx
            .update(shoppingItems)
            .set({
              quantity: Math.min(SHOPPING_QUANTITY_MAX, open.quantity + item.quantity),
              // A line wanted by hand stays manual.
              origin: open.origin === 'manual' || item.origin === 'manual' ? 'manual' : 'auto',
            })
            .where(and(eq(shoppingItems.id, open.id), eq(shoppingItems.householdId, householdId)));
          await tx
            .delete(shoppingItems)
            .where(and(eq(shoppingItems.id, item.id), eq(shoppingItems.householdId, householdId)));
        } else {
          await tx
            .update(shoppingItems)
            .set({ productId: keptId })
            .where(and(eq(shoppingItems.id, item.id), eq(shoppingItems.householdId, householdId)));
        }
      }

      // Earlier merges into the source now lead to the kept product.
      await tx
        .update(products)
        .set({ mergedIntoId: keptId })
        .where(and(eq(products.mergedIntoId, sourceId), eq(products.householdId, householdId)));
      await tx
        .update(products)
        .set({ mergedIntoId: keptId, updatedAt: sql`now()` })
        .where(and(eq(products.id, sourceId), eq(products.householdId, householdId)));

      await syncAutoShopping(tx, householdId, sourceId);
      await syncAutoShopping(tx, householdId, keptId);

      const [fresh] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, keptId), eq(products.householdId, householdId)));
      return {
        kept: toProductDto(fresh!),
        movedUnits,
        movedLines: lines.length,
        movedShoppingItems: shopping.length,
      };
    });
  }
}
