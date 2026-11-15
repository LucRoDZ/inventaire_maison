/** Reasons a client may give to `POST /stock/adjust` (`move` is written by the move routes). */
export const ADJUST_REASONS = ['scan_add', 'scan_remove', 'manual', 'correction'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export type MovementReason = AdjustReason | 'move';

export interface StockAdjustInput {
  productId: number;
  locationId: number;
  /** Omitted or null: the "Non rangé" tray of the location. */
  shelfId?: number | null;
  /** `YYYY-MM-DD`; omitted or null: no expiry date. */
  expiryDate?: string | null;
  /** Non-zero: positive adds units, negative removes them. */
  delta: number;
  reason: AdjustReason;
}

export interface StockLineDto {
  id: number;
  productId: number;
  locationId: number;
  shelfId: number | null;
  quantity: number;
  expiryDate: string | null;
}

export interface StockMovementDto {
  id: number;
  productId: number;
  locationId: number;
  shelfId: number | null;
  expiryDate: string | null;
  delta: number;
  reason: MovementReason;
  userId: number;
  createdAt: string;
}

export interface StockAdjustResponse {
  /** The line after the change, or null when it reached zero and was deleted. */
  item: StockLineDto | null;
  movement: StockMovementDto;
}

export const STOCK_SORTS = ['name', 'added', 'expiry'] as const;
export type StockSort = (typeof STOCK_SORTS)[number];

/** Days (inclusive) before the expiry date from which a line is flagged as "soon". */
export const EXPIRY_SOON_DAYS = 3;

/** Absent when the line has no date or it is still far away. */
export type ExpiryStatus = { status: 'expired' } | { status: 'soon'; days: number };

export interface StockListItemDto {
  id: number;
  quantity: number;
  expiryDate: string | null;
  expiry: ExpiryStatus | null;
  createdAt: string;
  product: {
    id: number;
    name: string;
    brand: string | null;
    sizeLabel: string | null;
    imageUrl: string | null;
    categoryGuessed: boolean;
  };
  category: { id: number; name: string; icon: string };
  location: { id: number; name: string };
  shelf: { id: number; name: string } | null;
}

export interface LocationCountDto {
  locationId: number;
  /** Distinct products in stock. */
  products: number;
  units: number;
}

export interface StockListResponse {
  items: StockListItemDto[];
  /** One entry per location, empty ones included; filters on location and shelf are ignored. */
  counts: LocationCountDto[];
}
