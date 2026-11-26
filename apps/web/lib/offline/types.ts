import type { CatalogCacheEntry, SyncOp, SyncResult } from '@inventaire/shared';

/** An operation waiting on the device. A conflict or a rejection stays until the user decides. */
export interface QueuedOp {
  /** Position in the queue (ascending: the order of the scans). */
  seq: number;
  op: SyncOp;
  /** `pending`: to send. `failed`: the server answered `result`; not sent again before a retry. */
  status: 'pending' | 'failed';
  result?: Extract<SyncResult, { status: 'conflict' | 'rejected' }>;
}

/** A barcode scanned offline that the catalogue did not know: to identify once online. */
export interface UnknownBarcode {
  code: string;
  scannedAt: string;
}

export interface CatalogCache {
  entries: CatalogCacheEntry[];
  fetchedAt: string;
}

export type MetaKey = 'deviceId' | 'scope';

/** Everything kept on the device for the offline mode, tagged with the data scope of the account. */
export interface OfflineStore {
  listOps(): Promise<QueuedOp[]>;
  /** Adds at the end of the queue; returns the stored operation. */
  addOp(op: SyncOp): Promise<QueuedOp>;
  updateOp(item: QueuedOp): Promise<void>;
  deleteOp(seq: number): Promise<void>;
  listUnknown(): Promise<UnknownBarcode[]>;
  putUnknown(item: UnknownBarcode): Promise<void>;
  deleteUnknown(code: string): Promise<void>;
  getCatalog(): Promise<CatalogCache | null>;
  setCatalog(cache: CatalogCache): Promise<void>;
  getMeta(key: MetaKey): Promise<string | null>;
  setMeta(key: MetaKey, value: string): Promise<void>;
  /** Queue, unknown codes, catalogue and scope; the device id stays (it is not private). */
  clearData(): Promise<void>;
}
