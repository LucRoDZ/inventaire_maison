import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../database/database.module';
import { products, shoppingItems, stockItems } from '../database/schema';

/**
 * Keeps the automatic line of the shopping list in step with the stock of one product. Called by
 * every service that changes a product's total stock, in the same transaction.
 *
 * - Minimum set and total below it: one open line of origin `auto` exists, unless the product is
 *   already on the list (an open line of any origin counts, a checked line is in the basket and is
 *   left alone).
 * - Otherwise (no minimum, or total at or above it): the open `auto` line goes away. A manual line
 *   is never touched, a checked line is never reopened.
 */
export async function syncAutoShopping(
  tx: Transaction,
  householdId: number,
  productId: number,
): Promise<void> {
  const [product] = await tx
    .select({ minQuantity: products.minQuantity, mergedIntoId: products.mergedIntoId })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.householdId, householdId)));
  if (!product) return;

  const [stock] = await tx
    .select({ total: sql<number>`coalesce(sum(${stockItems.quantity}), 0)::int` })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), eq(stockItems.householdId, householdId)));
  const total = stock?.total ?? 0;

  const wanted =
    product.mergedIntoId === null && product.minQuantity !== null && total < product.minQuantity;
  if (!wanted) {
    await tx
      .delete(shoppingItems)
      .where(
        and(
          eq(shoppingItems.householdId, householdId),
          eq(shoppingItems.productId, productId),
          eq(shoppingItems.checked, false),
          eq(shoppingItems.origin, 'auto'),
        ),
      );
    return;
  }

  // An open line (any origin) already says it; a checked one is in the basket, the purchase is
  // on its way.
  const [present] = await tx
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.householdId, householdId), eq(shoppingItems.productId, productId)))
    .limit(1);
  if (present) return;

  // The unique index on open lines is the net against a concurrent insert.
  await tx
    .insert(shoppingItems)
    .values({ householdId, productId, quantity: 1, origin: 'auto' })
    .onConflictDoNothing();
}
