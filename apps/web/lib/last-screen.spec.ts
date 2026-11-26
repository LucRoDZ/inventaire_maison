import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
});

describe('last screen', () => {
  it('falls back to the inventory, then returns the remembered screen', async () => {
    const { lastScreen, rememberScreen } = await import('./last-screen');
    expect(lastScreen()).toBe('/inventaire');
    rememberScreen('/courses');
    expect(lastScreen()).toBe('/courses');
    expect(sessionStorage.getItem('inventaire.last-screen')).toBe('/courses');
    rememberScreen('/');
    rememberScreen('/scanner');
    expect(lastScreen()).toBe('/courses');
  });
});
