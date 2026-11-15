import type { Detector, ScanResult } from './types';

let detector: Promise<Detector> | null = null;

/** Reads a code from a photo. Always ZXing: it works the same on every browser. */
export async function decodePhoto(blob: Blob): Promise<ScanResult | null> {
  if (!detector) {
    detector = import('./zxing-engine').then(({ createZXingDetector }) => createZXingDetector());
    // A failed load must not be remembered.
    detector.catch(() => {
      detector = null;
    });
  }
  return (await detector).detectImage(blob);
}
