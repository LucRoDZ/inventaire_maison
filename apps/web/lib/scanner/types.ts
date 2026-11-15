/** Formats the app reads: EAN-13, EAN-8, UPC-A and UPC-E (values of the `format` of `BarcodeDetector`). */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

export interface ScanResult {
  /** Raw digits as read; normalise with `normalizeBarcode` from `@inventaire/shared`. */
  code: string;
  format: ScanFormat;
}

/** Reads codes from one image source; the frame loop and the duplicate filter live above it. */
export interface Detector {
  detect(source: HTMLVideoElement): Promise<ScanResult[]>;
  detectImage(blob: Blob): Promise<ScanResult | null>;
}

export type ScannerEngine = 'native' | 'zxing' | 'fake';

export interface Scanner {
  readonly engine: ScannerEngine;
  /** Starts reading frames of `video`; `onResult` is not called twice for one code within 2 s. */
  start(video: HTMLVideoElement, onResult: (result: ScanResult) => void): void;
  stop(): void;
  /** Reads a still photo; null when there is no readable code. */
  decodeImage(blob: Blob): Promise<ScanResult | null>;
}

/** About 10 reads per second. */
export const SCAN_INTERVAL_MS = 100;
/** The same code is ignored for this long after being reported. */
export const SCAN_DEDUPE_MS = 2000;
