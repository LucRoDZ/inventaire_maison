import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { normalizeBarcode } from '@inventaire/shared';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScanner, type ScannerDeps } from './create-scanner';
import { createFrameScanner } from './frame-scanner';
import { isNativeSupported } from './native-engine';
import { SCAN_DEDUPE_MS, SCAN_INTERVAL_MS, type Detector, type ScanResult } from './types';
import { createZXingDetector } from './zxing-engine';

const fixture = (name: string) =>
  new Blob([readFileSync(path.join(import.meta.dirname, '../../test/fixtures/barcodes', name))]);

/** Node has no `createImageBitmap`: decode the PNG with sharp. */
async function blobToImageData(blob: Blob): Promise<ImageData> {
  const { data, info } = await sharp(Buffer.from(await blob.arrayBuffer()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height } as ImageData;
}

const require = createRequire(import.meta.url);
const wasm = readFileSync(
  path.resolve(
    path.dirname(require.resolve('zxing-wasm/reader')),
    '../../reader/zxing_reader.wasm',
  ),
);

describe('engine selection', () => {
  const detector: Detector = { detect: async () => [], detectImage: async () => null };
  const deps = (native: boolean): ScannerDeps & { zxing: ReturnType<typeof vi.fn> } => {
    const zxing = vi.fn(async () => detector);
    return {
      nativeSupported: async () => native,
      createNative: () => detector,
      createZXing: zxing,
      zxing,
    };
  };

  it('uses the native detector when it reads all four formats', async () => {
    const d = deps(true);
    expect((await createScanner(d)).engine).toBe('native');
    expect(d.zxing).not.toHaveBeenCalled();
  });

  it('falls back to ZXing otherwise', async () => {
    const d = deps(false);
    expect((await createScanner(d)).engine).toBe('zxing');
    expect(d.zxing).toHaveBeenCalledOnce();
  });

  describe('isNativeSupported', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is false without BarcodeDetector', async () => {
      vi.stubGlobal('BarcodeDetector', undefined);
      expect(await isNativeSupported()).toBe(false);
    });

    it('is false when a format is missing (UPC-E on some devices)', async () => {
      vi.stubGlobal('BarcodeDetector', {
        getSupportedFormats: async () => ['ean_13', 'ean_8', 'upc_a'],
      });
      expect(await isNativeSupported()).toBe(false);
    });

    it('is true when the four formats are there, false when the query throws', async () => {
      vi.stubGlobal('BarcodeDetector', {
        getSupportedFormats: async () => ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
      });
      expect(await isNativeSupported()).toBe(true);
      vi.stubGlobal('BarcodeDetector', {
        getSupportedFormats: async () => {
          throw new Error('boom');
        },
      });
      expect(await isNativeSupported()).toBe(false);
    });
  });
});

describe('frame scanner', () => {
  const video = { readyState: 4 } as HTMLVideoElement;
  const milk: ScanResult = { code: '3017620422003', format: 'ean_13' };
  let clock: number;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (detect: Detector['detect']) =>
    createFrameScanner('zxing', { detect, detectImage: async () => null }, { now: () => clock });

  it('reads about ten times per second', async () => {
    const detect = vi.fn(async () => []);
    make(detect).start(video, () => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(detect.mock.calls.length).toBe(1000 / SCAN_INTERVAL_MS);
  });

  it('never runs two reads at once and skips frames while the camera has none', async () => {
    let release: (value: ScanResult[]) => void = () => undefined;
    const detect = vi.fn(() => new Promise<ScanResult[]>((resolve) => (release = resolve)));
    const scanner = make(detect);
    scanner.start(video, () => undefined);
    await vi.advanceTimersByTimeAsync(500);
    expect(detect).toHaveBeenCalledTimes(1);
    release([]);
    scanner.stop();

    const idle = vi.fn(async () => []);
    make(idle).start({ readyState: 1 } as HTMLVideoElement, () => undefined);
    await vi.advanceTimersByTimeAsync(500);
    expect(idle).not.toHaveBeenCalled();
  });

  it('ignores the same code for 2 s, then reports it again', async () => {
    const onResult = vi.fn();
    make(async () => [milk]).start(video, onResult);
    await vi.advanceTimersByTimeAsync(500);
    expect(onResult).toHaveBeenCalledTimes(1);
    clock = SCAN_DEDUPE_MS - 1;
    await vi.advanceTimersByTimeAsync(200);
    expect(onResult).toHaveBeenCalledTimes(1);
    clock = SCAN_DEDUPE_MS;
    await vi.advanceTimersByTimeAsync(200);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('reports a different code at once', async () => {
    const codes = [milk, { code: '96385074', format: 'ean_8' as const }];
    const onResult = vi.fn();
    make(async () => [codes.shift() ?? milk]).start(video, onResult);
    await vi.advanceTimersByTimeAsync(300);
    expect(onResult.mock.calls.map(([r]) => r.code)).toEqual(['3017620422003', '96385074']);
  });

  it('stops reading after stop()', async () => {
    const detect = vi.fn(async () => []);
    const scanner = make(detect);
    scanner.start(video, () => undefined);
    await vi.advanceTimersByTimeAsync(300);
    scanner.stop();
    const calls = detect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(detect.mock.calls.length).toBe(calls);
  });
});

describe('ZXing engine on photos', () => {
  let detector: Detector;

  beforeEach(async () => {
    detector = await createZXingDetector({
      overrides: {
        instantiateWasm(imports, successCallback) {
          WebAssembly.instantiate(wasm, imports).then(({ instance }) => successCallback(instance));
          return {};
        },
      },
      blobToImageData,
    });
  });

  it.each([
    ['ean13-3017620422003.png', '3017620422003', 'ean_13'],
    ['ean8-96385074.png', '96385074', 'ean_8'],
  ])('decodes %s', async (file, code, format) => {
    expect(await detector.detectImage(fixture(file))).toEqual({ code, format });
  });

  it('decodes a UPC-A photo; ZXing reports it as the equivalent EAN-13 with a leading 0', async () => {
    const result = await detector.detectImage(fixture('upca-036000291452.png'));
    expect(result).not.toBeNull();
    expect(normalizeBarcode(result!.code)).toBe(normalizeBarcode('036000291452'));
  });

  it('returns null for an image without a code', async () => {
    expect(await detector.detectImage(fixture('no-code.png'))).toBeNull();
  });
});
