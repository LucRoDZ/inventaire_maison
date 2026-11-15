import type { ProductDetailDto, ProductDto } from './products';

/** Why a scanned code could not be turned into a product. */
export type ScanUnknownReason = 'not_found' | 'off_unavailable' | 'poor_data';

/** Fields found on an incomplete Open Food Facts card, to prefill the creation form. */
export interface ScanHints {
  brand: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
}

/** Already in the catalog, with its stock. */
export interface ScanKnownResponse {
  status: 'known';
  product: ProductDetailDto;
}

/** Just created from Open Food Facts; the category is a guess to confirm. */
export interface ScanSuggestedResponse {
  status: 'suggested';
  product: ProductDto;
}

export interface ScanUnknownResponse {
  status: 'unknown';
  reason: ScanUnknownReason;
  hints?: ScanHints;
}

export type ScanResponse = ScanKnownResponse | ScanSuggestedResponse | ScanUnknownResponse;
