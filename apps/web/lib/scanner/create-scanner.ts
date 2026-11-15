import { createFrameScanner } from './frame-scanner';
import { createNativeDetector, isNativeSupported } from './native-engine';
import type { Detector, Scanner } from './types';
import { createZXingDetector } from './zxing-engine';

export interface ScannerDeps {
  nativeSupported: () => Promise<boolean>;
  createNative: () => Detector;
  createZXing: () => Promise<Detector>;
}

const defaultDeps: ScannerDeps = {
  nativeSupported: isNativeSupported,
  createNative: createNativeDetector,
  createZXing: () => createZXingDetector(),
};

/** The native `BarcodeDetector` when it reads all four formats, otherwise ZXing. */
export async function createScanner(deps: ScannerDeps = defaultDeps): Promise<Scanner> {
  // Replaced at build time: outside end-to-end builds this branch, and the fake engine, disappear.
  if (process.env.NEXT_PUBLIC_E2E === '1') {
    const { createFakeScanner } = await import('./fake-engine');
    return createFakeScanner();
  }
  if (await deps.nativeSupported()) {
    return createFrameScanner('native', deps.createNative());
  }
  return createFrameScanner('zxing', await deps.createZXing());
}
