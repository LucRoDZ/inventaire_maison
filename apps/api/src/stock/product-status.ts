import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../database/database.module';
import { shoppingItems, stockItems } from '../database/schema';

/**
 * Where a product stands in the household once a stock change is done: units left (every location)
 * and whether it has a line on the shopping list (open or checked, any origin). Call it after
 * `syncAutoShopping`, in the same transaction.
 */
export async function productStatus(
  tx: Transaction,
  householdId: number,
  productId: number,
): Promise<{ productTotal: number; onShoppingList: boolean }> {
  const [stock] = await tx
    .select({ total: sql<number>`coalesce(sum(${stockItems.quantity}), 0)::int` })
    .from(stockItems)
    .where(and(eq(stockItems.productId, productId), eq(stockItems.householdId, householdId)));
  const [line] = await tx
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.householdId, householdId), eq(shoppingItems.productId, productId)))
    .limit(1);
  return { productTotal: stock?.total ?? 0, onShoppingList: line !== undefined };
}
