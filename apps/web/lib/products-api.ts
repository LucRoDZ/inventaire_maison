import type { ProductDto } from '@inventaire/shared';
import { apiFetch } from './api';

export interface NewProductInput {
  name: string;
  categoryId: number;
  brand?: string | null;
  sizeLabel?: string | null;
  defaultLocationId?: number | null;
  /** Canonical code; absent for a product without barcode (fruit, vegetables, butcher). */
  barcode?: string | null;
}

export const createProduct = (input: NewProductInput): Promise<ProductDto> =>
  apiFetch<ProductDto>('/products', { method: 'POST', body: input });

export function uploadProductImage(productId: number, photo: File): Promise<ProductDto> {
  const form = new FormData();
  form.append('image', photo);
  return apiFetch<ProductDto>(`/products/${productId}/image`, { method: 'POST', body: form });
}

export const searchProducts = (q: string, limit = 20): Promise<ProductDto[]> =>
  apiFetch<ProductDto[]>(`/products?q=${encodeURIComponent(q)}&limit=${limit}`);
