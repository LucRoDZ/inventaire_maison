import type {
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  CategoryDto,
} from '@inventaire/shared';
import { apiFetch } from './api';

export const adjustStock = (input: StockAdjustInput): Promise<StockAdjustResponse> =>
  apiFetch<StockAdjustResponse>('/stock/adjust', { method: 'POST', body: input });

export const fetchLocations = (): Promise<LocationDto[]> => apiFetch<LocationDto[]>('/locations');

export const fetchCategories = (): Promise<CategoryDto[]> => apiFetch<CategoryDto[]>('/categories');
