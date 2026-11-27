import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RECENT_PRODUCTS_DAYS,
  RECENT_PRODUCTS_MAX,
  SHOPPING_QUANTITY_MAX,
  type QuantityUnit,
  type RecentProductDto,
  type ShoppingClearResponse,
  type ShoppingItemCreateInput,
  type ShoppingItemDto,
  type ShoppingItemPatchInput,
  type ShoppingListResponse,
  type ShoppingOrigin,
  type ShoppingStoreResponse,
} from '@inventaire/shared';
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Transaction } from '../database/database.module';
import { locations, products, shoppingItems, stockItems, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { syncAutoShopping } from './auto-shopping';
import { productStatus } from '../stock/product-status';
import { findLine, lockProductLocation, placeNames } from '../stock/stock.service';

type Row = typeof shoppingItems.$inferSelect;
type ProductRow = typeof products.$inferSelect;

function toDto(row: Row, product: ProductRow | null): ShoppingItemDto {
  return {
    id: row.id,
    product: product
      ? {
          id: product.id,
          name: product.name,
          imageUrl: product.imagePath ? `/api/images/${product.imagePath}` : null,
          defaultLocationId: product.defaultLocationId,
        }
      : null,
    label: row.label,
    quantity: row.quantity,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit as QuantityUnit | null,
    checked: row.checked,
    origin: row.origin as ShoppingOrigin,
    createdAt: row.createdAt.toISOString(),
  };
}

const NOT_FOUND = 'Ligne introuvable';

@Injectable()
export class ShoppingService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  async list(): Promise<ShoppingListResponse> {
    return this.tenant.run(async (tx, householdId) => ({
      items: await this.listIn(tx, householdId),
    }));
  }

  private async listIn(tx: Transaction, householdId: number): Promise<ShoppingItemDto[]> {
    const rows = await tx
      .select({ item: shoppingItems, product: products })
      .from(shoppingItems)
      .leftJoin(
        products,
        and(eq(products.id, shoppingItems.productId), eq(products.householdId, householdId)),
      )
      .where(eq(shoppingItems.householdId, householdId))
      .orderBy(asc(shoppingItems.checked), asc(shoppingItems.createdAt), asc(shoppingItems.id));
    return rows.map((r) => toDto(r.item, r.product));
  }

  private async getIn(tx: Transaction, householdId: number, id: number): Promise<ShoppingItemDto> {
    const [row] = await tx
      .select({ item: shoppingItems, product: products })
      .from(shoppingItems)
      .leftJoin(
        products,
        and(eq(products.id, shoppingItems.productId), eq(products.householdId, householdId)),
      )
      .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)));
    if (!row) throw new NotFoundException(NOT_FOUND);
    return toDto(row.item, row.product);
  }

  async create(input: ShoppingItemCreateInput, userId: number): Promise<ShoppingItemDto> {
    return this.tenant.run(async (tx, householdId) => {
      const quantity = input.quantity ?? 1;
      const amount = input.amount ?? null;
      const unit = input.unit ?? null;

      if (input.productId == null) {
        const [row] = await tx
          .insert(shoppingItems)
          .values({
            householdId,
            label: input.label!,
            quantity,
            amount: amount === null ? null : String(amount),
            unit,
            createdBy: userId,
          })
          .returning();
        return this.getIn(tx, householdId, row!.id);
      }

      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.householdId, householdId),
            isNull(products.mergedIntoId),
          ),
        )
        .for('update');
      if (!product) throw new NotFoundException('Produit introuvable');

      if (input.ifAbsent) {
        const { onShoppingList } = await productStatus(tx, householdId, product.id);
        if (onShoppingList) throw new ConflictException('Déjà dans vos courses');
      }

      const [open] = await tx
        .select()
        .from(shoppingItems)
        .where(
          and(
            eq(shoppingItems.householdId, householdId),
            eq(shoppingItems.productId, product.id),
            eq(shoppingItems.checked, false),
          ),
        )
        .for('update');
      if (open) {
        await tx
          .update(shoppingItems)
          .set({ quantity: Math.min(SHOPPING_QUANTITY_MAX, open.quantity + quantity) })
          .where(and(eq(shoppingItems.id, open.id), eq(shoppingItems.householdId, householdId)));
        return this.getIn(tx, householdId, open.id);
      }
      const [row] = await tx
        .insert(shoppingItems)
        .values({
          householdId,
          productId: product.id,
          quantity,
          amount: amount === null ? null : String(amount),
          unit,
          createdBy: userId,
        })
        // An open line inserted meanwhile (automatic line of another change): no 500.
        .onConflictDoNothing()
        .returning();
      if (!row) {
        if (input.ifAbsent) throw new ConflictException('Déjà dans vos courses');
        const [raced] = await tx
          .select()
          .from(shoppingItems)
          .where(
            and(
              eq(shoppingItems.householdId, householdId),
              eq(shoppingItems.productId, product.id),
              eq(shoppingItems.checked, false),
            ),
          );
        if (!raced) throw new ConflictException('Déjà dans vos courses');
        await tx
          .update(shoppingItems)
          .set({ quantity: Math.min(SHOPPING_QUANTITY_MAX, raced.quantity + quantity) })
          .where(and(eq(shoppingItems.id, raced.id), eq(shoppingItems.householdId, householdId)));
        return this.getIn(tx, householdId, raced.id);
      }
      return this.getIn(tx, householdId, row.id);
    });
  }

  async update(id: number, patch: ShoppingItemPatchInput): Promise<ShoppingItemDto> {
    return this.tenant.run(async (tx, householdId) => {
      const [current] = await tx
        .select()
        .from(shoppingItems)
        .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)))
        .for('update');
      if (!current) throw new NotFoundException(NOT_FOUND);

      // Unchecking a line while the product already has an open one: the two lines are merged.
      if (patch.checked === false && current.checked && current.productId !== null) {
        const [open] = await tx
          .select()
          .from(shoppingItems)
          .where(
            and(
              eq(shoppingItems.householdId, householdId),
              eq(shoppingItems.productId, current.productId),
              eq(shoppingItems.checked, false),
            ),
          )
          .for('update');
        if (open) {
          const quantity = patch.quantity ?? current.quantity;
          await tx
            .update(shoppingItems)
            .set({ quantity: Math.min(SHOPPING_QUANTITY_MAX, open.quantity + quantity) })
            .where(and(eq(shoppingItems.id, open.id), eq(shoppingItems.householdId, householdId)));
          await tx
            .delete(shoppingItems)
            .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)));
          return this.getIn(tx, householdId, open.id);
        }
      }

      await tx
        .update(shoppingItems)
        .set({
          ...(patch.quantity !== undefined && { quantity: patch.quantity }),
          ...(patch.checked !== undefined && {
            checked: patch.checked,
            checkedAt: patch.checked ? sql`now()` : null,
          }),
        })
        .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)));
      return this.getIn(tx, householdId, id);
    });
  }

  async remove(id: number): Promise<void> {
    await this.tenant.run(async (tx, householdId) => {
      const deleted = await tx
        .delete(shoppingItems)
        .where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)))
        .returning({ id: shoppingItems.id });
      if (deleted.length === 0) throw new NotFoundException(NOT_FOUND);
    });
  }

  async clearChecked(): Promise<ShoppingClearResponse> {
    return this.tenant.run(async (tx, householdId) => {
      const deleted = await tx
        .delete(shoppingItems)
        .where(and(eq(shoppingItems.householdId, householdId), eq(shoppingItems.checked, true)))
        .returning({ id: shoppingItems.id, productId: shoppingItems.productId });
      // A checked line held back the automatic line of its product: give it back if still needed.
      const productIds = new Set(deleted.flatMap((row) => (row.productId ? [row.productId] : [])));
      for (const productId of productIds) await syncAutoShopping(tx, householdId, productId);
      return { removed: deleted.length };
    });
  }

  /** Checked lines of a product with a usual location go to the stock; the others need the form. */
  async storeChecked(userId: number): Promise<ShoppingStoreResponse> {
    return this.tenant.run(async (tx, householdId) => {
      const rows = await tx
        .select({ item: shoppingItems, product: products })
        .from(shoppingItems)
        .leftJoin(
          products,
          and(eq(products.id, shoppingItems.productId), eq(products.householdId, householdId)),
        )
        .where(and(eq(shoppingItems.householdId, householdId), eq(shoppingItems.checked, true)))
        .orderBy(asc(shoppingItems.checkedAt), asc(shoppingItems.id));

      const stored: ShoppingStoreResponse['stored'] = [];
      const needsForm: ShoppingItemDto[] = [];
      for (const { item, product } of rows) {
        if (!product || product.defaultLocationId === null) {
          needsForm.push(toDto(item, product));
          continue;
        }
        const locationId = product.defaultLocationId;
        const key = { productId: product.id, locationId, shelfId: null, expiryDate: null };
        await lockProductLocation(tx, product.id, locationId);
        const current = await findLine(tx, householdId, key);
        let line: typeof stockItems.$inferSelect | undefined;
        if (current) {
          [line] = await tx
            .update(stockItems)
            .set({ quantity: current.quantity + item.quantity, updatedAt: sql`now()` })
            .where(and(eq(stockItems.id, current.id), eq(stockItems.householdId, householdId)))
            .returning();
        } else {
          [line] = await tx
            .insert(stockItems)
            .values({ ...key, householdId, quantity: item.quantity })
            .returning();
        }
        const names = await placeNames(tx, householdId, locationId, null);
        await tx.insert(stockMovements).values({
          ...key,
          ...names,
          householdId,
          delta: item.quantity,
          reason: 'scan_add',
          userId,
        });
        await tx
          .delete(shoppingItems)
          .where(and(eq(shoppingItems.id, item.id), eq(shoppingItems.householdId, householdId)));
        await syncAutoShopping(tx, householdId, product.id);
        stored.push({
          shoppingItemId: item.id,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          locationId,
          stockItemId: line!.id,
        });
      }
      return { stored, needsForm };
    });
  }

  /**
   * Products consumed in the last `days` days, most frequent first, with what « Ajouter à nouveau »
   * shows: usual location, size, units in stock, date of the last consumption.
   */
  async recent(
    limit: number = RECENT_PRODUCTS_MAX,
    days: number = RECENT_PRODUCTS_DAYS,
  ): Promise<RecentProductDto[]> {
    return this.tenant.run(async (tx, householdId) => {
      const count = sql<number>`count(*)::int`;
      const lastConsumedAt = sql<Date>`max(${stockMovements.createdAt})`;
      const inStock = sql<number>`coalesce((select sum(${stockItems.quantity}) from ${stockItems}
        where ${stockItems.productId} = ${products.id}
          and ${stockItems.householdId} = ${householdId}), 0)::int`;
      const rows = await tx
        .select({
          productId: products.id,
          name: products.name,
          imagePath: products.imagePath,
          sizeLabel: products.sizeLabel,
          locationName: locations.name,
          count,
          lastConsumedAt,
          inStock,
        })
        .from(stockMovements)
        .innerJoin(
          products,
          and(
            eq(products.id, stockMovements.productId),
            eq(products.householdId, householdId),
            isNull(products.mergedIntoId),
          ),
        )
        .leftJoin(
          locations,
          and(eq(locations.id, products.defaultLocationId), eq(locations.householdId, householdId)),
        )
        .where(
          and(
            eq(stockMovements.householdId, householdId),
            eq(stockMovements.reason, 'consumed'),
            lt(stockMovements.delta, 0),
            sql`${stockMovements.createdAt} >= now() - make_interval(days => ${days})`,
          ),
        )
        .groupBy(products.id, products.name, products.imagePath, products.sizeLabel, locations.name)
        .orderBy(desc(count), asc(products.name), asc(products.id))
        .limit(limit);
      return rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        imageUrl: r.imagePath ? `/api/images/${r.imagePath}` : null,
        count: r.count,
        lastConsumedAt: new Date(r.lastConsumedAt).toISOString(),
        locationName: r.locationName ?? null,
        sizeLabel: r.sizeLabel ?? null,
        inStock: r.inStock,
      }));
    });
  }
}
