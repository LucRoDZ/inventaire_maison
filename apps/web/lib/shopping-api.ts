import type {
  RecentProductDto,
  ShoppingClearResponse,
  ShoppingItemCreateInput,
  ShoppingItemDto,
  ShoppingItemPatchInput,
  ShoppingListResponse,
  ShoppingStoreResponse,
} from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchShopping = (): Promise<ShoppingListResponse> =>
  apiFetch<ShoppingListResponse>('/shopping');

export const addShoppingItem = (input: ShoppingItemCreateInput): Promise<ShoppingItemDto> =>
  apiFetch<ShoppingItemDto>('/shopping', { method: 'POST', body: input });

export const patchShoppingItem = (
  id: number,
  patch: ShoppingItemPatchInput,
): Promise<ShoppingItemDto> =>
  apiFetch<ShoppingItemDto>(`/shopping/${id}`, { method: 'PATCH', body: patch });

export const deleteShoppingItem = (id: number): Promise<void> =>
  apiFetch(`/shopping/${id}`, { method: 'DELETE' });

export const clearCheckedShopping = (): Promise<ShoppingClearResponse> =>
  apiFetch<ShoppingClearResponse>('/shopping/clear-checked', { method: 'POST' });

export const storeCheckedShopping = (): Promise<ShoppingStoreResponse> =>
  apiFetch<ShoppingStoreResponse>('/shopping/store-checked', { method: 'POST' });

/** Products consumed lately; `limit` and `days` default to the chips of the shopping list. */
export function fetchRecentProducts(
  params: { limit?: number; days?: number } = {},
): Promise<RecentProductDto[]> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.days !== undefined) query.set('days', String(params.days));
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiFetch<RecentProductDto[]>(`/shopping/recent${suffix}`);
}

/** « 500 g », « 2 unités »: what a line asks for, besides its name. */
export function shoppingQuantityText(item: {
  quantity: number;
  amount: number | null;
  unit: string | null;
}): string {
  const amount =
    item.amount !== null && item.unit !== null && item.unit !== 'unit'
      ? ` · ${String(item.amount).replace('.', ',')} ${item.unit}`
      : '';
  return `× ${item.quantity}${amount}`;
}
