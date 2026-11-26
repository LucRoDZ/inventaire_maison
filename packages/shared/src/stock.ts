/** Why units leave the stock: eaten or thrown away (statistics, waste rate). */
export const REMOVAL_REASONS = ['consumed', 'wasted'] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];
/** The removal reason chosen in one gesture; `wasted` is the visible second choice. */
export const DEFAULT_REMOVAL_REASON: RemovalReason = 'consumed';

/** Reasons a client may give to `POST /stock/adjust` (`move` is written by the move routes). */
export const ADJUST_REASONS = [
  'scan_add',
  'scan_remove',
  'manual',
  'correction',
  ...REMOVAL_REASONS,
] as const;
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
  /** Phase 5: units of this product left in the household, every location included. */
  productTotal: number;
  /** Phase 5: the product has a line on the shopping list (open or checked, any origin). */
  onShoppingList: boolean;
}

export const STOCK_SORTS = ['name', 'added', 'expiry'] as const;
export type StockSort = (typeof STOCK_SORTS)[number];

/**
 * Default of the per-household alert threshold (`settings.expiry_alert_days`): days (inclusive)
 * before the expiry date from which a line is flagged as "soon". The API uses the household value.
 */
export const EXPIRY_SOON_DAYS = 3;

/**
 * Expiry filters of `GET /stock?expiry=` (and of the home counters): `today` = expires today
 * (`soon` with `days: 0`), `soon` = within 1 to threshold days, `expired` = date passed.
 */
export const EXPIRY_FILTERS = ['today', 'soon', 'expired'] as const;
export type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];

/** Absent when the line has no date or it is still far away. `soon` with `days: 0` = today. */
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

export interface StockMoveInput {
  stockItemId: number;
  toLocationId: number;
  /** Omitted or null: the "Non rangé" tray of the destination. */
  toShelfId?: number | null;
  /** Units to move, between 1 and the quantity of the line. */
  quantity: number;
}

export interface StockMoveResponse {
  /** The source line after the move, or null when everything was moved. */
  from: StockLineDto | null;
  /** The destination line after the merge. */
  to: StockLineDto;
  /** The two `move` movements: first the removal, then the addition. */
  movements: [StockMovementDto, StockMovementDto];
}

export interface StockRemoveInput {
  productId: number;
  /** Omitted: `consumed`. */
  reason?: RemovalReason;
}

export interface StockRemoveResponse {
  /** The line that was touched, after the change, or null when it reached zero. */
  item: StockLineDto | null;
  movement: StockMovementDto;
  product: { id: number; name: string };
  location: { id: number; name: string };
  shelf: { id: number; name: string } | null;
  /** Phase 5: units of this product left in the household, every location included. */
  productTotal: number;
  /** Phase 5: the product has a line on the shopping list (open or checked, any origin). */
  onShoppingList: boolean;
}

export interface MovementHistoryItemDto {
  id: number;
  delta: number;
  reason: MovementReason;
  expiryDate: string | null;
  createdAt: string;
  /** Kept even when the account is disabled. */
  user: { id: number; username: string };
  location: { id: number; name: string };
  shelf: { id: number; name: string } | null;
}

export interface MovementHistoryResponse {
  items: MovementHistoryItemDto[];
  /** Pass it as `cursor` to get the next (older) page; null on the last page. */
  nextCursor: string | null;
}

/** `GET /stock/summary`: the four counters at the top of the inventory. */
export interface StockSummaryDto {
  /** Distinct products in stock. */
  inStock: number;
  /** Stock lines per expiry filter, with the threshold of the household. */
  today: number;
  soon: number;
  expired: number;
  /** The threshold used (`settings.expiry_alert_days`). */
  expiryAlertDays: number;
}
