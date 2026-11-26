export type CameraErrorKind = 'denied' | 'absent' | 'insecure' | 'failed';

export class CameraError extends Error {
  constructor(readonly kind: CameraErrorKind) {
    super(`camera:${kind}`);
    this.name = 'CameraError';
  }
}

export interface CameraSession {
  /** Device actually in use, when the browser tells. */
  deviceId: string | null;
  torchSupported: boolean;
  /** Only when the track announces a zoom range. */
  zoom: ZoomRange | null;
  setTorch(on: boolean): Promise<void>;
  setZoom(value: number): Promise<void>;
  stop(): void;
}

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraInfo {
  id: string;
  label: string;
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
};

/** End-to-end builds only: what the tests can observe and simulate of the camera. */
interface E2ECameraWindow {
  __e2eCameraActive?: boolean;
  __e2eCameraError?: CameraErrorKind;
}

function classify(error: unknown): CameraErrorKind {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'absent';
  return 'failed';
}

/** Opens the rear camera (or `deviceId`) in `video` and returns what the track can do. */
export async function startCamera(
  video: HTMLVideoElement,
  options: { deviceId?: string } = {},
): Promise<CameraSession> {
  // End-to-end builds only (dropped from every other build): no camera in the test browsers.
  if (process.env.NEXT_PUBLIC_E2E === '1') {
    const flags = window as E2ECameraWindow;
    if (flags.__e2eCameraError) throw new CameraError(flags.__e2eCameraError);
    flags.__e2eCameraActive = true;
    return {
      deviceId: null,
      torchSupported: false,
      zoom: null,
      setTorch: async () => undefined,
      setZoom: async () => undefined,
      stop: () => {
        flags.__e2eCameraActive = false;
      },
    };
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new CameraError('insecure');
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('absent');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(options.deviceId
          ? { deviceId: { exact: options.deviceId } }
          : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (error) {
    throw new CameraError(classify(error));
  }

  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
  } catch {
    stop();
    throw new CameraError('failed');
  }

  const track = stream.getVideoTracks()[0];
  const capabilities = (track?.getCapabilities?.() ?? {}) as ExtendedCapabilities;
  if (track && capabilities.focusMode?.includes('continuous')) {
    // Best effort: a device that refuses simply keeps its own focus.
    void track
      .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
      .catch(() => undefined);
  }

  const zoomRange = capabilities.zoom;
  const zoom: ZoomRange | null =
    zoomRange && zoomRange.max > zoomRange.min
      ? { min: zoomRange.min, max: zoomRange.max, step: zoomRange.step || 0.1 }
      : null;

  return {
    deviceId: track?.getSettings?.().deviceId ?? null,
    torchSupported: capabilities.torch === true,
    zoom,
    async setTorch(on) {
      await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    },
    async setZoom(value) {
      await track?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
    },
    stop,
  };
}

/** Cameras the browser lists; labels are empty until the permission was given. */
export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Caméra ${index + 1}`,
      }));
  } catch {
    return [];
  }
}
