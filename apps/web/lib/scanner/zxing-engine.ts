import type { ReadResult, ZXingModuleOverrides } from 'zxing-wasm/reader';
import type { Detector, ScanFormat, ScanResult } from './types';

/** Served by the application itself (copied by `scripts/copy-zxing-wasm.mjs`), never by a CDN. */
export const ZXING_WASM_URL = '/zxing/zxing_reader.wasm';

const FORMAT_MAP: Record<string, ScanFormat> = {
  EAN13: 'ean_13',
  EAN8: 'ean_8',
  UPCA: 'upc_a',
  UPCE: 'upc_e',
};

/** Longest side of a still photo handed to the decoder (phone photos are much larger). */
const MAX_PHOTO_SIDE = 1600;

export interface ZXingEngineOptions {
  /** Test seam: Emscripten module overrides (e.g. `instantiateWasm` in Node). */
  overrides?: ZXingModuleOverrides;
  /** Test seam: turns a photo into pixels where `createImageBitmap` does not exist. */
  blobToImageData?: (blob: Blob) => Promise<ImageData>;
}

export function toScanResults(found: ReadResult[]): ScanResult[] {
  const results: ScanResult[] = [];
  for (const item of found) {
    const format = FORMAT_MAP[item.format];
    if (item.isValid && format) results.push({ code: item.text, format });
  }
  return results;
}

function drawToImageData(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas indisponible');
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function browserBlobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    return drawToImageData(
      bitmap,
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
  } finally {
    bitmap.close();
  }
}

export async function createZXingDetector(options: ZXingEngineOptions = {}): Promise<Detector> {
  const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader');
  prepareZXingModule({
    overrides: options.overrides ?? {
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? ZXING_WASM_URL : prefix + path),
    },
  });
  const readerOptions = {
    formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  } as const;
  const toImageData = options.blobToImageData ?? browserBlobToImageData;

  return {
    async detect(video) {
      if (video.videoWidth === 0 || video.videoHeight === 0) return [];
      const frame = drawToImageData(video, video.videoWidth, video.videoHeight);
      return toScanResults(
        await readBarcodes(frame, { ...readerOptions, formats: [...readerOptions.formats] }),
      );
    },
    async detectImage(blob) {
      const image = await toImageData(blob);
      const found = await readBarcodes(image, {
        ...readerOptions,
        formats: [...readerOptions.formats],
      });
      return toScanResults(found)[0] ?? null;
    },
  };
}
