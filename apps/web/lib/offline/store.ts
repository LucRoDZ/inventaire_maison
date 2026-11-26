import { SYNC_QUEUE_DB, SYNC_QUEUE_VERSION, type SyncOp } from '@inventaire/shared';
import type { CatalogCache, MetaKey, OfflineStore, QueuedOp, UnknownBarcode } from './types';

/** Same contract as the IndexedDB store, in memory: unit tests and browsers without IndexedDB. */
export class MemoryStore implements OfflineStore {
  private ops: QueuedOp[] = [];
  private unknown = new Map<string, UnknownBarcode>();
  private catalog: CatalogCache | null = null;
  private meta = new Map<string, string>();
  private next = 1;

  async listOps(): Promise<QueuedOp[]> {
    return this.ops.map((item) => structuredClone(item));
  }
  async addOp(op: SyncOp): Promise<QueuedOp> {
    const item: QueuedOp = { seq: this.next++, op: structuredClone(op), status: 'pending' };
    this.ops.push(item);
    return structuredClone(item);
  }
  async updateOp(item: QueuedOp): Promise<void> {
    const at = this.ops.findIndex((o) => o.seq === item.seq);
    if (at >= 0) this.ops[at] = structuredClone(item);
  }
  async deleteOp(seq: number): Promise<void> {
    this.ops = this.ops.filter((o) => o.seq !== seq);
  }
  async listUnknown(): Promise<UnknownBarcode[]> {
    return [...this.unknown.values()];
  }
  async putUnknown(item: UnknownBarcode): Promise<void> {
    this.unknown.set(item.code, { ...item });
  }
  async deleteUnknown(code: string): Promise<void> {
    this.unknown.delete(code);
  }
  async getCatalog(): Promise<CatalogCache | null> {
    return this.catalog ? structuredClone(this.catalog) : null;
  }
  async setCatalog(cache: CatalogCache): Promise<void> {
    this.catalog = structuredClone(cache);
  }
  async getMeta(key: MetaKey): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: MetaKey, value: string): Promise<void> {
    this.meta.set(key, value);
  }
  async clearData(): Promise<void> {
    this.ops = [];
    this.unknown.clear();
    this.catalog = null;
    this.meta.delete('scope');
  }
}

const OPS = 'ops';
const UNKNOWN = 'unknown';
const META = 'meta';
const CATALOG_KEY = 'catalog';

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** The queue, the unknown codes, the catalogue and the owner of the device, in IndexedDB. */
export class IdbStore implements OfflineStore {
  private opened: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(SYNC_QUEUE_DB, SYNC_QUEUE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(OPS, { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore(UNKNOWN, { keyPath: 'code' });
        db.createObjectStore(META);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.opened;
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(name, mode).objectStore(name);
  }

  async listOps(): Promise<QueuedOp[]> {
    return done((await this.store(OPS, 'readonly')).getAll()) as Promise<QueuedOp[]>;
  }
  async addOp(op: SyncOp): Promise<QueuedOp> {
    const item = { op, status: 'pending' } as QueuedOp;
    const seq = (await done((await this.store(OPS, 'readwrite')).add(item))) as number;
    return { ...item, seq };
  }
  async updateOp(item: QueuedOp): Promise<void> {
    await done((await this.store(OPS, 'readwrite')).put(item));
  }
  async deleteOp(seq: number): Promise<void> {
    await done((await this.store(OPS, 'readwrite')).delete(seq));
  }
  async listUnknown(): Promise<UnknownBarcode[]> {
    return done((await this.store(UNKNOWN, 'readonly')).getAll()) as Promise<UnknownBarcode[]>;
  }
  async putUnknown(item: UnknownBarcode): Promise<void> {
    await done((await this.store(UNKNOWN, 'readwrite')).put(item));
  }
  async deleteUnknown(code: string): Promise<void> {
    await done((await this.store(UNKNOWN, 'readwrite')).delete(code));
  }
  async getCatalog(): Promise<CatalogCache | null> {
    const value = await done((await this.store(META, 'readonly')).get(CATALOG_KEY));
    return (value as CatalogCache | undefined) ?? null;
  }
  async setCatalog(cache: CatalogCache): Promise<void> {
    await done((await this.store(META, 'readwrite')).put(cache, CATALOG_KEY));
  }
  async getMeta(key: MetaKey): Promise<string | null> {
    return ((await done((await this.store(META, 'readonly')).get(key))) as string) ?? null;
  }
  async setMeta(key: MetaKey, value: string): Promise<void> {
    await done((await this.store(META, 'readwrite')).put(value, key));
  }
  async clearData(): Promise<void> {
    await done((await this.store(OPS, 'readwrite')).clear());
    await done((await this.store(UNKNOWN, 'readwrite')).clear());
    await done((await this.store(META, 'readwrite')).delete(CATALOG_KEY));
    await done((await this.store(META, 'readwrite')).delete('scope'));
  }
}
