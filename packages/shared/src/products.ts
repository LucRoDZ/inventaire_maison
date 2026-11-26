import type { QuantityUnit } from './comfort';

export type ProductSource = 'off' | 'manual';

export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_TEXT_MAX_LENGTH = 80;

export interface ProductDto {
  id: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  /** Path of the local thumbnail, served by `GET /api/images/{file}`; null when there is none. */
  imageUrl: string | null;
  categoryId: number;
  /** True while the category comes from Open Food Facts or the fallback and nobody confirmed it. */
  categoryGuessed: boolean;
  defaultLocationId: number | null;
  source: ProductSource;
  createdBy: number | null;
  createdAt: string;
  /** Below this total stock the product goes to the shopping list; null: none. */
  minQuantity: number | null;
  /** Net content of one unit (e.g. 226.8 with `g`); null when unknown. */
  amount: number | null;
  unit: QuantityUnit | null;
  /** Set when the product was merged into another one (it then never appears in lists). */
  mergedIntoId: number | null;
}

export interface ProductStockLineDto {
  id: number;
  shelfId: number | null;
  shelfName: string | null;
  quantity: number;
  expiryDate: string | null;
}

export interface ProductStockByLocationDto {
  locationId: number;
  locationName: string;
  quantity: number;
  lines: ProductStockLineDto[];
}

export interface ProductDetailDto extends ProductDto {
  stock: ProductStockByLocationDto[];
}

/** `POST /products/:id/merge`: the product of the URL is merged into `intoProductId` (kept). */
export interface ProductMergeInput {
  intoProductId: number;
}

export interface ProductMergeResponse {
  kept: ProductDto;
  /** Units transferred by `correction` movements. */
  movedUnits: number;
  /** Stock lines and shopping lines moved to the kept product. */
  movedLines: number;
  movedShoppingItems: number;
}

/** `POST /products/:id/barcode`: attaches a scanned barcode to a product created by hand. */
export interface ProductAttachBarcodeInput {
  barcode: string;
}
