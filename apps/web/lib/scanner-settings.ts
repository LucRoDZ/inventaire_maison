export interface ScannerSettings {
  /** Camera chosen in Plus › Scanner; null = the rear camera, picked automatically. */
  cameraId: string | null;
  /** Keep the camera open and add each known product in one gesture. */
  burst: boolean;
}

export const SCANNER_SETTINGS_KEY = 'inventaire.scanner-settings.v1';

const DEFAULTS: ScannerSettings = { cameraId: null, burst: true };

export function readScannerSettings(): ScannerSettings {
  try {
    const raw = window.localStorage.getItem(SCANNER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    const { cameraId, burst } = parsed as Record<string, unknown>;
    return {
      cameraId: typeof cameraId === 'string' && cameraId !== '' ? cameraId : DEFAULTS.cameraId,
      burst: typeof burst === 'boolean' ? burst : DEFAULTS.burst,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeScannerSettings(partial: Partial<ScannerSettings>): void {
  try {
    const next = { ...readScannerSettings(), ...partial };
    window.localStorage.setItem(SCANNER_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the settings simply do not persist.
  }
}
