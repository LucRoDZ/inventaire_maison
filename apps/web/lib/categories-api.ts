import type { CategoryDto, CategoryIcon, OffCategoryMapDto } from '@inventaire/shared';
import { apiFetch } from './api';

/** Categories and Open Food Facts mappings of one household, for the admin console. */
export interface CategoriesApi {
  fetchCategories(): Promise<CategoryDto[]>;
  createCategory(input: { name: string; icon: CategoryIcon }): Promise<CategoryDto>;
  updateCategory(
    id: number,
    patch: { name?: string; icon?: CategoryIcon; sortOrder?: number },
  ): Promise<CategoryDto>;
  deleteCategory(id: number): Promise<void>;
  fetchMappings(): Promise<OffCategoryMapDto[]>;
  createMapping(input: { offTag: string; categoryId: number }): Promise<OffCategoryMapDto>;
  updateMapping(
    id: number,
    patch: { offTag?: string; categoryId?: number },
  ): Promise<OffCategoryMapDto>;
  deleteMapping(id: number): Promise<void>;
}

const bound = new Map<number, CategoriesApi>();

/**
 * Bound to the household chosen at the top of the screen: every read and write names it
 * explicitly, the server checks it (never deduced from the admin's own account). One object per
 * household, so that screens do not reload at each render.
 */
export function categoriesApiFor(householdId: number): CategoriesApi {
  let api = bound.get(householdId);
  if (!api) {
    api = makeApi(householdId);
    bound.set(householdId, api);
  }
  return api;
}

function makeApi(householdId: number): CategoriesApi {
  const base = `/admin/households/${householdId}`;
  return {
    fetchCategories: () => apiFetch<CategoryDto[]>(`${base}/categories`),
    createCategory: (input) =>
      apiFetch<CategoryDto>(`${base}/categories`, { method: 'POST', body: input }),
    updateCategory: (id, patch) =>
      apiFetch<CategoryDto>(`${base}/categories/${id}`, { method: 'PATCH', body: patch }),
    deleteCategory: (id) => apiFetch(`${base}/categories/${id}`, { method: 'DELETE' }),
    fetchMappings: () => apiFetch<OffCategoryMapDto[]>(`${base}/off-category-map`),
    createMapping: (input) =>
      apiFetch<OffCategoryMapDto>(`${base}/off-category-map`, { method: 'POST', body: input }),
    updateMapping: (id, patch) =>
      apiFetch<OffCategoryMapDto>(`${base}/off-category-map/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    deleteMapping: (id) => apiFetch(`${base}/off-category-map/${id}`, { method: 'DELETE' }),
  };
}
