import type { ScanFormat, ScanResult, Scanner } from './types';

declare global {
  interface Window {
    /** Pushes a code to the fake scanner (end-to-end tests only). */
    __e2eScan?: (code: string, format?: ScanFormat) => void;
  }
}

const POLL_MS = 50;

/**
 * End-to-end tests only: there is no camera, codes are pushed with `window.__e2eScan`.
 * Unlike the real engines it does not wait for a video frame and does not filter duplicates.
 */
export function createFakeScanner(): Scanner {
  const queue: ScanResult[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  window.__e2eScan = (code, format = 'ean_13') => {
    queue.push({ code, format });
  };
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  return {
    engine: 'fake',
    start(_video, onResult) {
      stop();
      timer = setInterval(() => {
        const next = queue.shift();
        if (next) onResult(next);
      }, POLL_MS);
    },
    stop,
    // A photo is "read" as the next pushed code.
    decodeImage: async () => queue.shift() ?? null,
  };
}
