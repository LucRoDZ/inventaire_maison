import { describe, expect, it, vi } from 'vitest';
import { applyBadge, badgeCount, refreshBadge } from './badge';

const target = () => ({
  setAppBadge: vi.fn(async () => undefined),
  clearAppBadge: vi.fn(async () => undefined),
});

describe('app badge', () => {
  it('counts expired and soon products', () => {
    expect(badgeCount({ soon: 2, expired: 3 })).toBe(5);
  });

  it('sets the number, and clears at 0', async () => {
    const badge = target();
    await applyBadge(4, badge);
    expect(badge.setAppBadge).toHaveBeenCalledWith(4);
    await applyBadge(0, badge);
    expect(badge.clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the API, and never throws', async () => {
    await expect(applyBadge(3, {})).resolves.toBeUndefined();
    await expect(
      applyBadge(3, { setAppBadge: () => Promise.reject(new Error('no')) }),
    ).resolves.toBeUndefined();
  });

  it('reads the summary through a mocked API', async () => {
    const badge = target();
    await refreshBadge(async () => ({ soon: 1, expired: 1 }), badge);
    expect(badge.setAppBadge).toHaveBeenCalledWith(2);
    await refreshBadge(async () => ({ soon: 0, expired: 0 }), badge);
    expect(badge.clearAppBadge).toHaveBeenCalled();
    badge.setAppBadge.mockClear();
    await refreshBadge(() => Promise.reject(new Error('offline')), badge);
    expect(badge.setAppBadge).not.toHaveBeenCalled();
  });
});
