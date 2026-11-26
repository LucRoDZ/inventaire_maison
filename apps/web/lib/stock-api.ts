import type {
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  StockListResponse,
  StockMoveInput,
  StockMoveResponse,
  StockRemoveResponse,
  StockSort,
  CategoryDto,
  ExpiryFilter,
  StockSummaryDto,
  RemovalReason,
  ProductDto,
} from '@inventaire/shared';
import { apiFetch } from './api';

export const adjustStock = (input: StockAdjustInput): Promise<StockAdjustResponse> =>
  apiFetch<StockAdjustResponse>('/stock/adjust', { method: 'POST', body: input });

export const fetchLocations = (): Promise<LocationDto[]> => apiFetch<LocationDto[]>('/locations');

export const fetchCategories = (): Promise<CategoryDto[]> => apiFetch<CategoryDto[]>('/categories');

/** Choosing a category, even the proposed one, confirms it (`category_guessed` becomes false). */
export const updateProductCategory = (productId: number, categoryId: number): Promise<ProductDto> =>
  apiFetch<ProductDto>(`/products/${productId}`, { method: 'PATCH', body: { categoryId } });

/** Removes one unit of the product (nearest expiry date first). 404 « Pas en stock » when empty. */
export const removeOne = (
  productId: number,
  reason: RemovalReason = 'consumed',
): Promise<StockRemoveResponse> =>
  apiFetch<StockRemoveResponse>('/stock/remove', { method: 'POST', body: { productId, reason } });

export interface StockFilters {
  location?: number;
  shelf?: number;
  category?: number;
  q?: string;
  sort?: StockSort;
  expiry?: ExpiryFilter;
}

export function fetchStock(filters: StockFilters = {}): Promise<StockListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<StockListResponse>(`/stock${query ? `?${query}` : ''}`);
}

export const moveStock = (input: StockMoveInput): Promise<StockMoveResponse> =>
  apiFetch<StockMoveResponse>('/stock/move', { method: 'POST', body: input });

export const fetchStockSummary = (): Promise<StockSummaryDto> =>
  apiFetch<StockSummaryDto>('/stock/summary');
