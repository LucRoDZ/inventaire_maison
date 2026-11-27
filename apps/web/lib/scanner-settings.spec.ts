import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readScannerSettings,
  SCANNER_SETTINGS_KEY,
  writeScannerSettings,
} from './scanner-settings';

describe('scanner settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to the automatic camera and burst on', () => {
    expect(readScannerSettings()).toEqual({ cameraId: null, burst: true });
  });

  it('merges a partial write and keeps the rest', () => {
    writeScannerSettings({ burst: false });
    writeScannerSettings({ cameraId: 'cam-2' });
    expect(readScannerSettings()).toEqual({ cameraId: 'cam-2', burst: false });
  });

  it('falls back to the defaults on corrupted JSON or wrong types', () => {
    window.localStorage.setItem(SCANNER_SETTINGS_KEY, '{nope');
    expect(readScannerSettings()).toEqual({ cameraId: null, burst: true });
    window.localStorage.setItem(SCANNER_SETTINGS_KEY, JSON.stringify({ cameraId: 3, burst: 'x' }));
    expect(readScannerSettings()).toEqual({ cameraId: null, burst: true });
  });

  it('never throws when the storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readScannerSettings()).toEqual({ cameraId: null, burst: true });
    expect(() => writeScannerSettings({ burst: false })).not.toThrow();
  });
});
