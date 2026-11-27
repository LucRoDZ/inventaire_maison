import { Flashlight, FlashlightOff } from 'lucide-react';
import type { ZoomRange } from '../../lib/scanner/camera';

interface TorchButtonProps {
  torchOn: boolean;
  onToggle: () => void;
}

/** Round torch button for the top right of the viewfinder; rendered only when supported. */
export function TorchButton({ torchOn, onToggle }: TorchButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={torchOn}
      aria-label={torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
      onClick={onToggle}
      className={`tap-target inline-flex items-center justify-center justify-self-end rounded-full ${torchOn ? 'bg-scanner-frame text-scanner-on-frame' : 'bg-scanner-veil text-scanner-ink'}`}
    >
      {torchOn ? (
        <FlashlightOff size={22} aria-hidden="true" />
      ) : (
        <Flashlight size={22} aria-hidden="true" />
      )}
    </button>
  );
}

interface ZoomSliderProps {
  zoom: ZoomRange;
  zoomValue: number;
  onZoom: (value: number) => void;
}

/** Thin zoom slider above the bottom row; rendered only when the track exposes a zoom range. */
export function ZoomSlider({ zoom, zoomValue, onZoom }: ZoomSliderProps) {
  return (
    <label className="bg-scanner-veil text-scanner-ink text-small flex min-h-11 w-full max-w-xs items-center gap-2 rounded-full px-4">
      Zoom
      <input
        type="range"
        min={zoom.min}
        max={zoom.max}
        step={zoom.step}
        value={zoomValue}
        onChange={(event) => onZoom(Number(event.target.value))}
        className="accent-amber h-1 flex-1"
      />
    </label>
  );
}
