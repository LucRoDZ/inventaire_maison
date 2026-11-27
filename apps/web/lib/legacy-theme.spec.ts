import { describe, expect, it } from 'vitest';
import { LEGACY_THEME_KEY, purgeLegacyTheme } from './legacy-theme';

describe('purgeLegacyTheme', () => {
  it('removes a stored dark choice and the data-theme attribute', () => {
    window.localStorage.setItem(LEGACY_THEME_KEY, 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    purgeLegacyTheme(window.localStorage, document.documentElement);
    expect(window.localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('survives a storage that throws or is missing', () => {
    const throwing = {
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => purgeLegacyTheme(throwing, document.documentElement)).not.toThrow();
    expect(() => purgeLegacyTheme(null, document.documentElement)).not.toThrow();
  });
});
