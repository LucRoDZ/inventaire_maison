import type { CategoryDto, CategoryIcon, OffCategoryMapDto } from '@inventaire/shared';
import { apiFetch } from './api';

export const fetchCategories = (): Promise<CategoryDto[]> => apiFetch<CategoryDto[]>('/categories');

export const createCategory = (input: { name: string; icon: CategoryIcon }): Promise<CategoryDto> =>
  apiFetch<CategoryDto>('/categories', { method: 'POST', body: input });

export const updateCategory = (
  id: number,
  patch: { name?: string; icon?: CategoryIcon; sortOrder?: number },
): Promise<CategoryDto> =>
  apiFetch<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: patch });

export const deleteCategory = (id: number): Promise<void> =>
  apiFetch(`/categories/${id}`, { method: 'DELETE' });

export const fetchMappings = (): Promise<OffCategoryMapDto[]> =>
  apiFetch<OffCategoryMapDto[]>('/off-category-map');

export const createMapping = (input: {
  offTag: string;
  categoryId: number;
}): Promise<OffCategoryMapDto> =>
  apiFetch<OffCategoryMapDto>('/off-category-map', { method: 'POST', body: input });

export const updateMapping = (
  id: number,
  patch: { offTag?: string; categoryId?: number },
): Promise<OffCategoryMapDto> =>
  apiFetch<OffCategoryMapDto>(`/off-category-map/${id}`, { method: 'PATCH', body: patch });

export const deleteMapping = (id: number): Promise<void> =>
  apiFetch(`/off-category-map/${id}`, { method: 'DELETE' });
