import { Flashlight, FlashlightOff } from 'lucide-react';
import type { CameraInfo } from '../../lib/scanner/camera';
import { Button } from '../ui/Button';

interface CameraControlsProps {
  /** Only offered when the track exposes the capability. */
  torchSupported: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  cameras: CameraInfo[];
  cameraId: string | null;
  onSelectCamera: (id: string) => void;
}

export function CameraControls({
  torchSupported,
  torchOn,
  onToggleTorch,
  cameras,
  cameraId,
  onSelectCamera,
}: CameraControlsProps) {
  if (!torchSupported && cameras.length < 2) return null;
  return (
    <div className="flex items-center gap-3">
      {torchSupported ? (
        <Button variant="secondary" aria-pressed={torchOn} onClick={onToggleTorch}>
          {torchOn ? (
            <FlashlightOff size={18} aria-hidden="true" />
          ) : (
            <Flashlight size={18} aria-hidden="true" />
          )}
          {torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
        </Button>
      ) : null}
      {cameras.length > 1 ? (
        <label className="text-small flex items-center gap-2">
          Caméra
          <select
            className="tap-target border-line text-ink rounded-xl border bg-white px-2"
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
