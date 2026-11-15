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
