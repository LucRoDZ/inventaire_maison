'use client';

import { useEffect } from 'react';
import { applyTheme, readTheme } from '../../lib/theme';

/** Renders nothing: aligns the theme-color meta and follows the phone while the choice is « Automatique ». */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readTheme());
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = () => {
      if (readTheme() === 'auto') applyTheme('auto');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return null;
}
