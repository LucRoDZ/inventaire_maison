import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
import { clearAppCaches } from './clear-caches';
import { cachedHome, fetchHome } from './home-api';

afterEach(() => vi.clearAllMocks());

describe('home in memory', () => {
  it('keeps the last house read, and forgets it when the caches are emptied (sign-in, logout)', async () => {
    const house = { locations: [] };
    apiFetch.mockResolvedValueOnce(house);
    expect(await fetchHome()).toBe(house);
    expect(cachedHome()).toBe(house);
    await clearAppCaches();
    expect(cachedHome()).toBeNull();
  });
});
