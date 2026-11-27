'use client';

import type { CatalogCacheEntry, SyncOp, SyncResponse, SyncResult } from '@inventaire/shared';
import { useSyncExternalStore } from 'react';
import { apiFetch } from '../api';
import { OfflineQueue, type NewSyncOp } from './queue';
import { IdbStore, MemoryStore } from './store';

/** Shown when a scan was kept on the device instead of being sent. */
export const OFFLINE_SCAN_MESSAGE = 'Hors ligne : le scan est gardé sur cet appareil';

const api = {
  sync: async (ops: SyncOp[]): Promise<SyncResult[]> =>
    (await apiFetch<SyncResponse>('/sync', { method: 'POST', body: { ops } })).results,
  catalog: (): Promise<CatalogCacheEntry[]> => apiFetch<CatalogCacheEntry[]>('/sync/catalog'),
};

let instance: OfflineQueue | null = null;

/** The queue of this device (IndexedDB; memory when the browser has none). */
export function getQueue(): OfflineQueue {
  if (!instance) {
    const store = typeof indexedDB === 'undefined' ? new MemoryStore() : new IdbStore();
    instance = new OfflineQueue(store, api);
    void instance.refresh().catch(() => undefined);
  }
  return instance;
}

export const queueOp = (input: NewSyncOp) => getQueue().queueOp(input);
export const findCachedProduct = (barcode: string) => getQueue().findCachedProduct(barcode);
export const keepUnknownBarcode = (code: string) => getQueue().keepUnknownBarcode(code);
/** Drops a queued operation (an undo before it was sent). */
export const abandonOp = (seq: number) => getQueue().abandon(seq);

/** Operations and unknown codes waiting on this device. */
export function usePendingCount(): number {
  const queue = typeof window === 'undefined' ? null : getQueue();
  return useSyncExternalStore(
    queue?.subscribe ?? (() => () => undefined),
    queue?.getCount ?? (() => 0),
    () => 0,
  );
}

export type OfflineScanOutcome =
  { kind: 'queued'; productName: string } | { kind: 'unknown'; barcode: string };

/**
 * A code scanned without a connection: a known product is added to the queue (one unit, usual
 * location), an unknown code is kept « à identifier ». Nothing is ever silent: the caller shows
 * `OFFLINE_SCAN_MESSAGE`.
 */
export async function handleOfflineScan(code: string): Promise<OfflineScanOutcome> {
  const cached = await findCachedProduct(code);
  if (!cached) {
    await keepUnknownBarcode(code);
    return { kind: 'unknown', barcode: code };
  }
  await queueOp({ kind: 'add', productId: cached.id, quantity: 1 });
  return { kind: 'queued', productName: cached.name };
}

/** Tells the queue which data scope owns the device; another scope than before purges it. */
export const bindDataScope = (scope: string) => getQueue().ensureScope(scope);

/** Sign-out or session lost: queue, unknown codes and catalogue are deleted. */
export async function purgeOfflineData(): Promise<void> {
  if (typeof indexedDB === 'undefined' && instance === null) return;
  await getQueue().purge();
}

/** Downloads the catalogue then sends what waits. Safe to call at any time (one flush at once). */
export async function syncNow(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const queue = getQueue();
  await queue.refreshCatalog();
  await queue.flush();
}

let started = false;

/** Syncs on reconnection and when the app becomes visible again; once per page. */
export function startOfflineSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => void syncNow().catch(() => undefined);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}
