import type {
  MovementHistoryResponse,
  ProductDetailDto,
  ProductDto,
  ProductMergeResponse,
  QuantityUnit,
} from '@inventaire/shared';
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

export const getProduct = (id: number): Promise<ProductDetailDto> =>
  apiFetch<ProductDetailDto>(`/products/${id}`);

export interface ProductPatch {
  name?: string;
  brand?: string | null;
  /** Sending it, even unchanged, confirms the category (`category_guessed` becomes false). */
  categoryId?: number;
  defaultLocationId?: number | null;
  /** Below this total stock the product goes to the shopping list; null: none. */
  minQuantity?: number | null;
  /** Net content of one unit; both null to forget it. */
  amount?: number | null;
  unit?: QuantityUnit | null;
}

export const updateProduct = (id: number, patch: ProductPatch): Promise<ProductDto> =>
  apiFetch<ProductDto>(`/products/${id}`, { method: 'PATCH', body: patch });

export const fetchMovements = (
  id: number,
  { cursor, limit = 20 }: { cursor?: string | null; limit?: number } = {},
): Promise<MovementHistoryResponse> =>
  apiFetch<MovementHistoryResponse>(
    `/products/${id}/movements?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );

/** The product of the URL is merged into `intoProductId`, which is kept. */
export const mergeProduct = (id: number, intoProductId: number): Promise<ProductMergeResponse> =>
  apiFetch<ProductMergeResponse>(`/products/${id}/merge`, {
    method: 'POST',
    body: { intoProductId },
  });

/** Attaches a scanned barcode to a product created by hand. */
export const attachBarcode = (id: number, barcode: string): Promise<ProductDto> =>
  apiFetch<ProductDto>(`/products/${id}/barcode`, { method: 'POST', body: { barcode } });
