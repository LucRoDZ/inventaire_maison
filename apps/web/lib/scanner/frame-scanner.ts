import {
  SCAN_DEDUPE_MS,
  SCAN_INTERVAL_MS,
  type Detector,
  type ScanResult,
  type Scanner,
  type ScannerEngine,
} from './types';

export interface FrameScannerOptions {
  intervalMs?: number;
  dedupeMs?: number;
  now?: () => number;
}

/** Turns a detector into a scanner: fixed cadence, no overlapping reads, duplicate filter. */
export function createFrameScanner(
  engine: ScannerEngine,
  detector: Detector,
  options: FrameScannerOptions = {},
): Scanner {
  const intervalMs = options.intervalMs ?? SCAN_INTERVAL_MS;
  const dedupeMs = options.dedupeMs ?? SCAN_DEDUPE_MS;
  const now = options.now ?? Date.now;

  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  const lastSeen = new Map<string, number>();

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    lastSeen.clear();
  };

  return {
    engine,
    start(video, onResult) {
      stop();
      timer = setInterval(() => {
        // One read at a time; skip the tick while the camera has no frame yet.
        if (busy || video.readyState < 2) return;
        busy = true;
        const running = timer;
        detector
          .detect(video)
          .then((results) => {
            if (timer === null || timer !== running) return;
            const first = results[0];
            if (!first) return;
            const at = now();
            const previous = lastSeen.get(first.code);
            if (previous !== undefined && at - previous < dedupeMs) return;
            lastSeen.set(first.code, at);
            onResult(first);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, intervalMs);
    },
    stop,
    decodeImage: (blob) => detector.detectImage(blob),
  };
}

export type { ScanResult };
