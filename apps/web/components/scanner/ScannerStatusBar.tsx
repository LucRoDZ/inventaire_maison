'use client';

import { useEffect } from 'react';

/**
 * While the scanner is open, the status bar takes the dark of the viewfinder (Android, installed
 * app or Chrome): no white band above the camera. The light colour comes back on exit. iPhone keeps
 * its status bar style for the whole app (Safari cannot change it while running).
 */
export function ScannerStatusBar() {
  useEffect(() => {
    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    const dark = getComputedStyle(document.documentElement)
      .getPropertyValue('--scanner-backdrop')
      .trim();
    if (dark) meta.content = dark;
    return () => {
      meta.content = previous;
    };
  }, []);
  return null;
}
