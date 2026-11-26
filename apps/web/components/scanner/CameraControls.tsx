import { Flashlight, FlashlightOff } from 'lucide-react';
import type { CameraInfo, ZoomRange } from '../../lib/scanner/camera';

interface CameraControlsProps {
  /** Only offered when the track exposes the capability. */
  torchSupported: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  zoom: ZoomRange | null;
  zoomValue: number;
  onZoom: (value: number) => void;
  cameras: CameraInfo[];
  cameraId: string | null;
  onSelectCamera: (id: string) => void;
}

const chip = 'bg-scanner-veil text-scanner-ink flex items-center gap-2 rounded-full px-3';

/** Laid over the camera: the torch, the zoom and the camera choice, each only when available. */
export function CameraControls({
  torchSupported,
  torchOn,
  onToggleTorch,
  zoom,
  zoomValue,
  onZoom,
  cameras,
  cameraId,
  onSelectCamera,
}: CameraControlsProps) {
  if (!torchSupported && !zoom && cameras.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {torchSupported ? (
        <button
          type="button"
          aria-pressed={torchOn}
          onClick={onToggleTorch}
          className={`tap-target font-semibold ${chip}`}
        >
          {torchOn ? (
            <FlashlightOff size={18} aria-hidden="true" />
          ) : (
            <Flashlight size={18} aria-hidden="true" />
          )}
          {torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
        </button>
      ) : null}
      {zoom ? (
        <label className={`tap-target text-small ${chip}`}>
          Zoom
          <input
            type="range"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoomValue}
            onChange={(event) => onZoom(Number(event.target.value))}
            className="accent-amber w-28"
          />
        </label>
      ) : null}
      {cameras.length > 1 ? (
        <label className={`tap-target text-small ${chip}`}>
          Caméra
          <select
            className="border-line text-ink h-9 rounded-xl border bg-white px-2"
            value={cameraId ?? ''}
            onChange={(event) => onSelectCamera(event.target.value)}
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
