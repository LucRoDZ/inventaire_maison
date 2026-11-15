import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logout } from './auth';
import { RUNTIME_CACHES } from './cache-names';

const fetchMock = vi.fn();
let deleted: string[];

beforeEach(() => {
  deleted = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { pathname: '/plus', assign: vi.fn() });
  vi.stubGlobal('caches', {
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('logout', () => {
  it('empties the caches after a successful sign-out', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await logout();
    expect(deleted.sort()).toEqual([...RUNTIME_CACHES].sort());
  });

  it('empties the caches even when the server cannot be reached, and reports the error', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(logout()).rejects.toMatchObject({ status: 0 });
    expect(deleted.sort()).toEqual([...RUNTIME_CACHES].sort());
  });

  it('empties the caches when the session has already expired', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Authentification requise' }), { status: 401 }),
    );
    await expect(logout()).rejects.toMatchObject({ status: 401 });
    expect(deleted).toEqual(expect.arrayContaining([...RUNTIME_CACHES]));
  });
});
