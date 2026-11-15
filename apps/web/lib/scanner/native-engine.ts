import { SCAN_FORMATS, type Detector, type ScanFormat, type ScanResult } from './types';

interface NativeBarcode {
  rawValue: string;
  format: string;
}
interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<NativeBarcode[]>;
}
interface NativeBarcodeDetectorConstructor {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const nativeConstructor = (): NativeBarcodeDetectorConstructor | undefined =>
  (globalThis as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;

/** True when `BarcodeDetector` reads all four retail formats. */
export async function isNativeSupported(): Promise<boolean> {
  const Ctor = nativeConstructor();
  if (!Ctor) return false;
  try {
    const supported = await Ctor.getSupportedFormats();
    return SCAN_FORMATS.every((format) => supported.includes(format));
  } catch {
    return false;
  }
}

const toResults = (found: NativeBarcode[]): ScanResult[] =>
  found
    .filter((item) => (SCAN_FORMATS as readonly string[]).includes(item.format))
    .map((item) => ({ code: item.rawValue, format: item.format as ScanFormat }));

export function createNativeDetector(): Detector {
  const Ctor = nativeConstructor();
  if (!Ctor) throw new Error('BarcodeDetector indisponible');
  const detector = new Ctor({ formats: [...SCAN_FORMATS] });
  return {
    async detect(video) {
      return toResults(await detector.detect(video));
    },
    async detectImage(blob) {
      const bitmap = await createImageBitmap(blob);
      try {
        return toResults(await detector.detect(bitmap))[0] ?? null;
      } finally {
        bitmap.close();
      }
    },
  };
}
