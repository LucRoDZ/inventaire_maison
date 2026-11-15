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
