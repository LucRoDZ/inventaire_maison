import { createFrameScanner } from './frame-scanner';
import type { Detector, ScanFormat, ScanResult, Scanner } from './types';

declare global {
  interface Window {
    /** Pushes a code to the fake scanner (end-to-end tests only). */
    __e2eScan?: (code: string, format?: ScanFormat) => void;
  }
}

/** End-to-end tests only: the camera is replaced by codes pushed with `window.__e2eScan`. */
export function createFakeScanner(): Scanner {
  const queue: ScanResult[] = [];
  window.__e2eScan = (code, format = 'ean_13') => {
    queue.push({ code, format });
  };
  const detector: Detector = {
    async detect() {
      const next = queue.shift();
      return next ? [next] : [];
    },
    async detectImage() {
      return queue.shift() ?? null;
    },
  };
  return createFrameScanner('fake', detector, { dedupeMs: 0 });
}
