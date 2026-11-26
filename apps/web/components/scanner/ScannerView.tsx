'use client';

import { ScanBarcode } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  CameraError,
  listCameras,
  startCamera,
  type CameraErrorKind,
  type CameraInfo,
  type CameraSession,
} from '../../lib/scanner/camera';
import { createScanner } from '../../lib/scanner/create-scanner';
import type { ScanResult, Scanner } from '../../lib/scanner/types';
import { setBusy } from '../../lib/silent-update';
import { Button } from '../ui/Button';
import { CameraControls } from './CameraControls';
import { PermissionHelp } from './PermissionHelp';

export type ScanMode = 'add' | 'remove';

interface ScannerViewProps {
  /** Called for every code read, with the mode chosen at that moment. */
  onCode: (result: ScanResult, mode: ScanMode) => void;
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  /** Fallbacks (typed code, photo), always reachable below the viewfinder. */
  fallbacks?: ReactNode;
  /** While true the camera stays on but no code is read (a sheet or a request is in progress). */
  paused?: boolean;
  /** Lets the parent turn the camera off (« Ajouter » returns to the screen the scan started from). */
  controlRef?: Ref<ScannerControls>;
  /** Test seam. */
  makeScanner?: () => Promise<Scanner>;
}

export interface ScannerControls {
  stopCamera: () => void;
}

type Phase =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'running' }
  | { name: 'error'; reason: CameraErrorKind };

function feedback(): void {
  try {
    navigator.vibrate?.(60);
  } catch {
    // Vibration is a bonus.
  }
  try {
    const Audio =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.onended = () => void context.close();
  } catch {
    // The beep is a bonus.
  }
}

export function ScannerView({
  onCode,
  mode,
  onModeChange,
  fallbacks,
  paused = false,
  controlRef,
  makeScanner = createScanner,
}: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const modeRef = useRef(mode);
  const onCodeRef = useRef(onCode);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    onCodeRef.current = onCode;
  });

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    sessionRef.current?.stop();
    sessionRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setPhase((current) => (current.name === 'error' ? current : { name: 'idle' }));
  }, []);

  const startReading = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    scannerRef.current?.start(video, (result) => {
      feedback();
      onCodeRef.current(result, modeRef.current);
    });
  }, []);

  const start = useCallback(
    async (deviceId?: string) => {
      const video = videoRef.current;
      if (!video) return;
      scannerRef.current?.stop();
      sessionRef.current?.stop();
      setPhase({ name: 'starting' });
      try {
        const session = await startCamera(video, { deviceId });
        sessionRef.current = session;
        setTorchSupported(session.torchSupported);
        setCameraId(session.deviceId);
        setCameras(await listCameras());
        scannerRef.current ??= await makeScanner();
        setPhase({ name: 'running' });
      } catch (error) {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setPhase({ name: 'error', reason: error instanceof CameraError ? error.kind : 'failed' });
      }
    },
    [makeScanner],
  );

  // The camera stays on while paused; only the reading stops.
  const running = phase.name === 'running';
  // A silent update never reloads the page while the camera is on.
  useEffect(() => {
    if (!running) return;
    setBusy('camera', true);
    return () => setBusy('camera', false);
  }, [running]);
  useEffect(() => {
    if (!running) return;
    if (paused) scannerRef.current?.stop();
    else startReading();
  }, [paused, running, startReading]);

  useImperativeHandle(controlRef, () => ({ stopCamera: () => stop() }), [stop]);

  // The camera is released when the tab is hidden and when leaving the screen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      scannerRef.current?.stop();
      sessionRef.current?.stop();
    };
  }, [stop]);

  const toggleTorch = async () => {
    const next = !torchOn;
    try {
      await sessionRef.current?.setTorch(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Mode du scan" className="bg-lavender flex gap-1 rounded-xl p-1">
        {(
          [
            ['add', 'Ajouter'],
            ['remove', 'Retirer'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={`tap-target flex-1 rounded-lg font-semibold ${mode === value ? 'bg-white text-indigo shadow-card' : 'text-indigo-mid hover:text-indigo'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-card bg-ink relative aspect-[4/3] overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Aperçu de la caméra"
          className={`h-full w-full object-cover ${running ? '' : 'invisible'}`}
        />
        {running ? (
          <div
            aria-hidden="true"
            className="border-amber pointer-events-none absolute top-1/2 left-1/2 h-1/3 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              variant="outline"
              disabled={phase.name === 'starting'}
              onClick={() => void start()}
            >
              <ScanBarcode size={20} aria-hidden="true" />
              {phase.name === 'starting' ? 'Démarrage…' : 'Scanner'}
            </Button>
          </div>
        )}
      </div>

      {running ? (
        <CameraControls
          torchSupported={torchSupported}
          torchOn={torchOn}
          onToggleTorch={() => void toggleTorch()}
          cameras={cameras}
          cameraId={cameraId}
          onSelectCamera={(id) => void start(id)}
        />
      ) : null}

      {phase.name === 'error' ? (
        <PermissionHelp
          reason={phase.reason}
          onRetry={() => void start()}
          onUseFallback={() =>
            fallbackRef.current?.querySelector<HTMLElement>('input, button')?.focus()
          }
        />
      ) : null}

      <div ref={fallbackRef}>{fallbacks}</div>
    </div>
  );
}
