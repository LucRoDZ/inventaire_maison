import {
  SYNC_MAX_OPS,
  type CatalogCacheEntry,
  type SyncOp,
  type SyncResult,
} from '@inventaire/shared';
import type { OfflineStore, QueuedOp, UnknownBarcode } from './types';

/** What the screens give to `queueOp`: the key, device and date are added here. */
export type NewSyncOp =
  | (Omit<Extract<SyncOp, { kind: 'add' }>, 'key' | 'deviceId' | 'createdAt'> & {
      /** ISO date of the movement when it is not now (« Acheté le »). */
      createdAt?: string;
    })
  | Omit<Extract<SyncOp, { kind: 'remove' }>, 'key' | 'deviceId' | 'createdAt'>
  | Omit<Extract<SyncOp, { kind: 'shop' }>, 'key' | 'deviceId' | 'createdAt'>;

/** The two server calls the queue needs, injected so that tests never touch the network. */
export interface SyncApi {
  sync(ops: SyncOp[]): Promise<SyncResult[]>;
  catalog(): Promise<CatalogCacheEntry[]>;
}

export interface FlushOutcome {
  /** Operations the server took (applied or already applied). */
  done: number;
  /** Operations left in the queue as conflicts or rejections. */
  failed: number;
  /** The server could not be reached or answered an error: the rest stays queued. */
  interrupted: boolean;
}

export class OfflineQueue {
  private listeners = new Set<() => void>();
  private count = 0;
  private flushing: Promise<FlushOutcome> | null = null;

  constructor(
    private readonly store: OfflineStore,
    private readonly api: SyncApi,
    private readonly uuid: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Pending count, for `useSyncExternalStore`.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getCount = (): number => this.count;

  private async changed(): Promise<void> {
    const [ops, unknown] = await Promise.all([this.store.listOps(), this.store.listUnknown()]);
    this.count = ops.length + unknown.length;
    this.listeners.forEach((listener) => listener());
  }

  /** Reads the count from the store (at start-up). */
  refresh(): Promise<void> {
    return this.changed();
  }

  /** The opaque, persistent id of this installation. */
  async deviceId(): Promise<string> {
    const known = await this.store.getMeta('deviceId');
    if (known) return known;
    const created = this.uuid();
    await this.store.setMeta('deviceId', created);
    return created;
  }

  async queueOp(input: NewSyncOp): Promise<QueuedOp> {
    const op = {
      ...input,
      key: this.uuid(),
      deviceId: await this.deviceId(),
      createdAt: ('createdAt' in input && input.createdAt) || this.now().toISOString(),
    } as SyncOp;
    const item = await this.store.addOp(op);
    await this.changed();
    return item;
  }

  async keepUnknownBarcode(code: string): Promise<void> {
    await this.store.putUnknown({ code, scannedAt: this.now().toISOString() });
    await this.changed();
  }

  list(): Promise<QueuedOp[]> {
    return this.store.listOps();
  }
  listUnknown(): Promise<UnknownBarcode[]> {
    return this.store.listUnknown();
  }

  /** Sends the waiting operations in order, in batches of `SYNC_MAX_OPS`. One call at a time. */
  flush(): Promise<FlushOutcome> {
    this.flushing ??= this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<FlushOutcome> {
    const outcome: FlushOutcome = { done: 0, failed: 0, interrupted: false };
    const waiting = (await this.store.listOps()).filter((item) => item.status === 'pending');
    for (let from = 0; from < waiting.length; from += SYNC_MAX_OPS) {
      const batch = waiting.slice(from, from + SYNC_MAX_OPS);
      let results: SyncResult[];
      try {
        results = await this.api.sync(batch.map((item) => item.op));
      } catch {
        outcome.interrupted = true;
        break;
      }
      const byKey = new Map(results.map((result) => [result.key, result]));
      for (const item of batch) {
        const result = byKey.get(item.op.key);
        if (!result) continue; // no answer: stays queued, sent again (the key makes it safe)
        if (result.status === 'applied' || result.status === 'duplicate') {
          await this.store.deleteOp(item.seq);
          outcome.done += 1;
        } else {
          await this.store.updateOp({ ...item, status: 'failed', result });
          outcome.failed += 1;
        }
      }
    }
    await this.changed();
    return outcome;
  }

  /** Puts a failed operation back in the queue; a merged product is replaced by its target. */
  async retry(seq: number): Promise<void> {
    const item = (await this.store.listOps()).find((o) => o.seq === seq);
    if (!item) return;
    const op =
      item.result?.status === 'conflict' &&
      item.result.conflict === 'merged' &&
      item.result.mergedIntoId !== undefined
        ? { ...item.op, productId: item.result.mergedIntoId }
        : item.op;
    await this.store.updateOp({ seq, op, status: 'pending' });
    await this.changed();
  }

  async abandon(seq: number): Promise<void> {
    await this.store.deleteOp(seq);
    await this.changed();
  }

  /** The code was identified (or given up): it leaves the « à identifier » list. */
  async dropUnknown(code: string): Promise<void> {
    await this.store.deleteUnknown(code);
    await this.changed();
  }

  /** Downloads the catalogue of the household; a failure keeps the previous copy. */
  async refreshCatalog(): Promise<boolean> {
    try {
      const scope = await this.store.getMeta('scope');
      if (scope === null) return false;
      const entries = await this.api.catalog();
      // Signed out or another account meanwhile: this catalogue belongs to nobody on the device.
      if ((await this.store.getMeta('scope')) !== scope) return false;
      await this.store.setCatalog({ entries, fetchedAt: this.now().toISOString() });
      return true;
    } catch {
      return false;
    }
  }

  async findCachedProduct(barcode: string): Promise<CatalogCacheEntry | null> {
    const cache = await this.store.getCatalog();
    return cache?.entries.find((entry) => entry.barcode === barcode) ?? null;
  }

  /**
   * Binds the device data to an account scope. Another scope than the stored one, or none (data
   * written after a sign-out, in another tab or by a late response): everything is deleted first.
   */
  async ensureScope(scope: string): Promise<void> {
    const current = await this.store.getMeta('scope');
    if (current !== scope) await this.store.clearData();
    await this.store.setMeta('scope', scope);
    await this.changed();
  }

  /** Sign-out: nothing of the household stays on the device. */
  async purge(): Promise<void> {
    await this.store.clearData();
    await this.changed();
  }
}
