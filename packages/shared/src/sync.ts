import type { RemovalReason } from './stock';

/** Offline queue of the device (Phase 4). */
export const SYNC_QUEUE_DB = 'inventaire-sync';
export const SYNC_QUEUE_VERSION = 1;
/** At most this many operations per `POST /sync`; the device sends the rest in the next call. */
export const SYNC_MAX_OPS = 100;
/** Keys older than this are purged by the scheduled task: a device must sync before. */
export const IDEMPOTENCY_TTL_DAYS = 14;
export const SYNC_KEY_MIN_LENGTH = 8;
export const SYNC_KEY_MAX_LENGTH = 100;

/**
 * One operation scanned on the device, sent later by `POST /sync`. `key` (a random UUID made on the
 * device) makes the replay harmless; `deviceId` is an opaque random id of the installation.
 */
export type SyncOp =
  | {
      kind: 'add';
      key: string;
      deviceId: string;
      /** ISO date of the scan on the device (journal ordering, display). */
      createdAt: string;
      productId: number;
      /** Omitted: the usual location of the product (conflict `no_location` without one). */
      locationId?: number;
      /** Omitted or null: the "Non rangé" tray. */
      shelfId?: number | null;
      expiryDate?: string | null;
      quantity: number;
    }
  | {
      kind: 'remove';
      key: string;
      deviceId: string;
      createdAt: string;
      productId: number;
      quantity: number;
      /** Omitted: `consumed`. Lines are chosen like `POST /stock/remove` (nearest expiry first). */
      reason?: RemovalReason;
    };

export type SyncOpKind = SyncOp['kind'];

export const SYNC_CONFLICTS = [
  /** The product was merged into another one: the device may resend to `mergedIntoId`. */
  'merged',
  /** Fewer units in stock than the removal asks: nothing was removed. */
  'insufficient_stock',
  /** No location given and the product has no usual location. */
  'no_location',
] as const;
export type SyncConflict = (typeof SYNC_CONFLICTS)[number];

/** Result of one operation, in the order of the request. */
export type SyncResult =
  | { key: string; status: 'applied' }
  /** The key was already applied: nothing changed, the first result is returned. */
  | { key: string; status: 'duplicate'; first: 'applied' }
  | { key: string; status: 'conflict'; conflict: SyncConflict; mergedIntoId?: number }
  /** Invalid or outside the household (unknown product, location of another household). */
  | { key: string; status: 'rejected'; message: string };

export interface SyncRequest {
  ops: SyncOp[];
}

export interface SyncResponse {
  results: SyncResult[];
}

/** `GET /sync/catalog`: what the device keeps to scan known products offline. */
export interface CatalogCacheEntry {
  id: number;
  name: string;
  barcode: string | null;
  defaultLocationId: number | null;
}

/** Owner of the data kept on the device: purged when another account signs in or on sign-out. */
export interface DeviceDataOwner {
  userId: number;
  householdId: number;
}
