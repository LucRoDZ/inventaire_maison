import { SYNC_MAX_OPS, type SyncOp, type SyncResult } from '@inventaire/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { conflictMessage } from './messages';
import { OfflineQueue, type SyncApi } from './queue';
import { MemoryStore } from './store';

let n = 0;
let calls: SyncOp[][];
let answer: (op: SyncOp) => SyncResult;
let down: boolean;
let store: MemoryStore;
let queue: OfflineQueue;

const api: SyncApi = {
  async sync(ops) {
    if (down) throw new Error('offline');
    calls.push(ops);
    return ops.map((op) => answer(op));
  },
  async catalog() {
    if (down) throw new Error('offline');
    return [{ id: 7, name: 'Lait', barcode: '3017620422003', defaultLocationId: 2 }];
  },
};

beforeEach(() => {
  n = 0;
  calls = [];
  down = false;
  answer = (op) => ({ key: op.key, status: 'applied' });
  store = new MemoryStore();
  queue = new OfflineQueue(store, api, () => `uuid-${(n += 1)}-xxxxxxxx`);
});

describe('queueOp', () => {
  it('stores operations in order with a key, the device id and a date', async () => {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    await queue.queueOp({ kind: 'remove', productId: 1, quantity: 1 });
    const items = await queue.list();
    expect(items.map((i) => i.op.kind)).toEqual(['add', 'remove']);
    expect(new Set(items.map((i) => i.op.key)).size).toBe(2);
    expect(items[0]!.op.deviceId).toBe(items[1]!.op.deviceId);
    expect(await queue.deviceId()).toBe(items[0]!.op.deviceId);
    expect(queue.getCount()).toBe(2);
  });

  it('counts the unknown barcodes, once each', async () => {
    await queue.keepUnknownBarcode('111');
    await queue.keepUnknownBarcode('111');
    expect(await queue.listUnknown()).toHaveLength(1);
    expect(queue.getCount()).toBe(1);
  });
});

describe('flush', () => {
  it('sends in order, in batches, and empties the queue', async () => {
    for (let i = 0; i < SYNC_MAX_OPS + 5; i += 1) {
      await queue.queueOp({ kind: 'add', productId: i + 1, quantity: 1 });
    }
    const outcome = await queue.flush();
    expect(calls.map((c) => c.length)).toEqual([SYNC_MAX_OPS, 5]);
    expect(calls.flat().map((o) => o.productId)).toEqual(
      Array.from({ length: SYNC_MAX_OPS + 5 }, (_, i) => i + 1),
    );
    expect(outcome).toEqual({ done: SYNC_MAX_OPS + 5, failed: 0, interrupted: false });
    expect(queue.getCount()).toBe(0);
  });

  it('keeps everything when the server cannot be reached, then replays with the same keys', async () => {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    down = true;
    expect((await queue.flush()).interrupted).toBe(true);
    expect(queue.getCount()).toBe(1);
    const [before] = await queue.list();
    down = false;
    await queue.flush();
    expect(calls[0]![0]!.key).toBe(before!.op.key);
    expect(queue.getCount()).toBe(0);
  });

  it('treats a duplicate as done', async () => {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    answer = (op) => ({ key: op.key, status: 'duplicate', first: 'applied' });
    expect((await queue.flush()).done).toBe(1);
    expect(queue.getCount()).toBe(0);
  });

  it('keeps a conflict, does not resend it, and retries a merged product on its target', async () => {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    answer = (op) => ({ key: op.key, status: 'conflict', conflict: 'merged', mergedIntoId: 9 });
    expect((await queue.flush()).failed).toBe(1);
    const [failed] = await queue.list();
    expect(failed!.status).toBe('failed');
    expect(conflictMessage(failed!)).toMatch(/fusionné/);
    expect(queue.getCount()).toBe(1);

    calls = [];
    await queue.flush();
    expect(calls).toEqual([]);

    answer = (op) => ({ key: op.key, status: 'applied' });
    await queue.retry(failed!.seq);
    await queue.flush();
    expect(calls[0]![0]).toMatchObject({ productId: 9, key: failed!.op.key });
    expect(queue.getCount()).toBe(0);
  });

  it('abandons an operation', async () => {
    const item = await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    await queue.abandon(item.seq);
    expect(queue.getCount()).toBe(0);
  });

  it('runs one flush at a time', async () => {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    await Promise.all([queue.flush(), queue.flush()]);
    expect(calls).toHaveLength(1);
  });
});

describe('catalogue cache', () => {
  it('finds a product by barcode, and keeps the old copy when the refresh fails', async () => {
    expect(await queue.findCachedProduct('3017620422003')).toBeNull();
    expect(await queue.refreshCatalog()).toBe(true);
    expect(await queue.findCachedProduct('3017620422003')).toMatchObject({ id: 7 });
    expect(await queue.findCachedProduct('000')).toBeNull();
    down = true;
    expect(await queue.refreshCatalog()).toBe(false);
    expect(await queue.findCachedProduct('3017620422003')).toMatchObject({ id: 7 });
  });
});

describe('device isolation', () => {
  async function fill() {
    await queue.queueOp({ kind: 'add', productId: 1, quantity: 1 });
    await queue.keepUnknownBarcode('111');
    await queue.refreshCatalog();
  }

  it('purges queue, unknown codes and catalogue on sign-out, keeping the device id', async () => {
    await queue.ensureScope('scope-a');
    await fill();
    const id = await queue.deviceId();
    await queue.purge();
    expect(queue.getCount()).toBe(0);
    expect(await queue.findCachedProduct('3017620422003')).toBeNull();
    expect(await queue.deviceId()).toBe(id);
  });

  it('keeps the data of the same scope and purges it for another one', async () => {
    await queue.ensureScope('scope-a');
    await fill();
    await queue.ensureScope('scope-a');
    expect(queue.getCount()).toBe(2);
    await queue.ensureScope('scope-b');
    expect(queue.getCount()).toBe(0);
    expect(await queue.findCachedProduct('3017620422003')).toBeNull();
  });
});
