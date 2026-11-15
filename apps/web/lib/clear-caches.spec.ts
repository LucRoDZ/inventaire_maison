import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_CACHES } from './cache-names';
import { clearAppCaches } from './clear-caches';

afterEach(() => vi.unstubAllGlobals());

describe('clearAppCaches', () => {
  it('deletes every runtime cache and leaves the precache alone', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    await clearAppCaches();
    expect(deleted.sort()).toEqual([...RUNTIME_CACHES].sort());
    expect(deleted.some((name) => name.includes('precache'))).toBe(false);
  });

  it('does nothing without the Cache API', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(clearAppCaches()).resolves.toBeUndefined();
  });
});
