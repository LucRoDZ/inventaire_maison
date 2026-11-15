import type {
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  CategoryDto,
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
