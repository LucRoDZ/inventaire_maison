import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScannerStatusBar } from './ScannerStatusBar';

describe('ScannerStatusBar', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.documentElement.style.removeProperty('--scanner-backdrop');
  });

  it('darkens the status bar while mounted, then restores it', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = 'white';
    document.head.appendChild(meta);
    document.documentElement.style.setProperty('--scanner-backdrop', 'black');
    const { unmount } = render(<ScannerStatusBar />);
    expect(meta.content).toBe('black');
    unmount();
    expect(meta.content).toBe('white');
  });
});
