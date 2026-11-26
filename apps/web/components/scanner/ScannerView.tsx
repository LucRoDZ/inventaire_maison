'use client';

import { Check, ScanBarcode, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { vibrateOnRead } from '../../lib/haptics';
import {
  CameraError,
  listCameras,
  startCamera,
  type CameraErrorKind,
  type CameraInfo,
  type CameraSession,
  type ZoomRange,
} from '../../lib/scanner/camera';
import { createScanner } from '../../lib/scanner/create-scanner';
import type { ScanResult, Scanner } from '../../lib/scanner/types';
import { setBusy } from '../../lib/silent-update';
import { Button } from '../ui/Button';
import { CameraControls } from './CameraControls';
import { PermissionHelp } from './PermissionHelp';

export type ScanMode = 'add' | 'remove';

/** The same code read again within this delay is ignored. */
export const SAME_CODE_DELAY_MS = 1500;

interface ScannerViewProps {
  /** Called for every code read, with the mode chosen at that moment. */
  onCode: (result: ScanResult, mode: ScanMode) => void;
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  /** « Fermer le scanner ». */
  onClose: () => void;
  /** Panel at the bottom, always reachable: typed code, photo, options. */
  fallbacks?: ReactNode;
  /** Free slot at the top of the screen, under the buttons (e.g. « À synchroniser (n) »). */
  topSlot?: ReactNode;
  /** Free slot over the camera, above the bottom panel (session counter, notices). */
  overlay?: ReactNode;
  /** What was just read (name, else code): announced as « Lu : … ». */
  readLabel?: string | null;
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

function beep(): void {
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

const CORNERS = [
  'top-0 left-0 rounded-tl-xl border-t-4 border-l-4',
  'top-0 right-0 rounded-tr-xl border-t-4 border-r-4',
  'bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4',
  'bottom-0 right-0 rounded-br-xl border-b-4 border-r-4',
];

export function ScannerView({
  onCode,
  mode,
  onModeChange,
  onClose,
  fallbacks,
  topSlot,
  overlay,
  readLabel = null,
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
  const makeScannerRef = useRef(makeScanner);
  const startId = useRef(0);
  const lastRead = useRef<{ code: string; at: number } | null>(null);
  /** The camera was on when the tab went away: it comes back with the tab. */
  const resumeOnVisible = useRef(false);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
    onCodeRef.current = onCode;
    makeScannerRef.current = makeScanner;
  });

  const stop = useCallback(() => {
    startId.current += 1;
    scannerRef.current?.stop();
    sessionRef.current?.stop();
    sessionRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setZoom(null);
    setPhase((current) => (current.name === 'error' ? current : { name: 'idle' }));
  }, []);

  const startReading = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    scannerRef.current?.start(video, (result) => {
      const now = Date.now();
      const previous = lastRead.current;
      if (previous && previous.code === result.code && now - previous.at < SAME_CODE_DELAY_MS) {
        return;
      }
      lastRead.current = { code: result.code, at: now };
      vibrateOnRead();
      beep();
      setLocked(true);
      onCodeRef.current(result, modeRef.current);
    });
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    const video = videoRef.current;
    if (!video) return;
    scannerRef.current?.stop();
    sessionRef.current?.stop();
    sessionRef.current = null;
    // A new camera starts with its torch off: the button must say so.
    setTorchOn(false);
    const id = ++startId.current;
    setPhase({ name: 'starting' });
    let session: CameraSession | null = null;
    try {
      session = await startCamera(video, { deviceId });
      if (id !== startId.current) {
        session.stop();
        return;
      }
      sessionRef.current = session;
      setTorchSupported(session.torchSupported);
      setZoom(session.zoom);
      setZoomValue(session.zoom?.min ?? 1);
      setCameraId(session.deviceId);
      setCameras(await listCameras());
      scannerRef.current ??= await makeScannerRef.current();
      if (id !== startId.current) return;
      setPhase({ name: 'running' });
    } catch (error) {
      if (id !== startId.current) {
        session?.stop();
        return;
      }
      session?.stop();
      sessionRef.current = null;
      setPhase({ name: 'error', reason: error instanceof CameraError ? error.kind : 'failed' });
    }
  }, []);

  // The camera opens with the screen.
  useEffect(() => {
    void start();
  }, [start]);

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

  // Corners stay locked while a sheet is open, then a moment after it closed.
  useEffect(() => {
    if (!locked || paused) return;
    const timer = setTimeout(() => setLocked(false), SAME_CODE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [locked, paused]);

  useImperativeHandle(controlRef, () => ({ stopCamera: () => stop() }), [stop]);

  // The camera is released when the tab is hidden and when leaving the screen; it comes back with
  // the tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        resumeOnVisible.current = sessionRef.current !== null;
        stop();
      } else if (resumeOnVisible.current) {
        resumeOnVisible.current = false;
        void start();
      }
    };
    const onPageHide = () => stop();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      startId.current += 1;
      scannerRef.current?.stop();
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [start, stop]);

  const toggleTorch = async () => {
    const next = !torchOn;
    try {
      await sessionRef.current?.setTorch(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const changeZoom = async (value: number) => {
    setZoomValue(value);
    try {
      await sessionRef.current?.setZoom(value);
    } catch {
      setZoom(null);
    }
  };

  return (
    <div className="bg-scanner-backdrop text-scanner-ink flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <h1 className="sr-only">Scanner</h1>
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Aperçu de la caméra"
          className={`absolute inset-0 h-full w-full object-cover ${running ? '' : 'invisible'}`}
        />

        {running ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 h-1/3 w-4/5 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-[0_0_0_100vmax_var(--scanner-veil)]"
          >
            {CORNERS.map((position) => (
              <span
                key={position}
                className={`border-scanner-frame absolute h-8 w-8 transition-transform duration-150 ${position} ${locked ? 'scale-110' : ''}`}
              />
            ))}
            {locked ? (
              <>
                <span className="border-scanner-frame absolute inset-0 rounded-xl border-2" />
                <span className="bg-scanner-frame text-scanner-on-frame absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
                  <Check size={28} aria-hidden="true" />
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        <p aria-live="polite" className="sr-only">
          {readLabel ? `Lu : ${readLabel}` : ''}
        </p>
        {running && locked && readLabel ? (
          <p
            aria-hidden="true"
            className="bg-scanner-veil text-scanner-ink absolute top-[calc(50%+18vh)] left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded-full px-3 py-1 font-semibold"
          >
            Lu : {readLabel}
          </p>
        ) : null}

        <div className="absolute inset-x-0 top-0 flex flex-col gap-3 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Fermer le scanner"
              onClick={onClose}
              className="tap-target bg-scanner-veil text-scanner-ink inline-flex items-center justify-center rounded-full"
            >
              <X size={24} aria-hidden="true" />
            </button>
            <div
              role="group"
              aria-label="Mode du scan"
              className="bg-scanner-veil flex gap-1 rounded-full p-1"
            >
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
                  className={`tap-target rounded-full px-4 font-semibold ${mode === value ? 'bg-scanner-frame text-scanner-on-frame' : 'text-scanner-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {topSlot}
          {running ? (
            <CameraControls
              torchSupported={torchSupported}
              torchOn={torchOn}
              onToggleTorch={() => void toggleTorch()}
              zoom={zoom}
              zoomValue={zoomValue}
              onZoom={(value) => void changeZoom(value)}
              cameras={cameras}
              cameraId={cameraId}
              onSelectCamera={(id) => void start(id)}
            />
          ) : null}
        </div>

        {phase.name === 'error' ? (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-card bg-white p-4 text-ink">
            <PermissionHelp
              reason={phase.reason}
              onRetry={() => void start()}
              onUseFallback={() =>
                fallbackRef.current?.querySelector<HTMLElement>('input, button')?.focus()
              }
            />
          </div>
        ) : null}
        {phase.name === 'idle' || phase.name === 'starting' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              variant="outline"
              disabled={phase.name === 'starting'}
              onClick={() => void start()}
            >
              <ScanBarcode size={20} aria-hidden="true" />
              {phase.name === 'starting' ? 'Démarrage…' : 'Activer la caméra'}
            </Button>
          </div>
        ) : null}

        {overlay ? (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
            {overlay}
          </div>
        ) : null}
      </div>

      <div
        ref={fallbackRef}
        className="rounded-t-card text-ink max-h-[45dvh] shrink-0 overflow-y-auto bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        {fallbacks}
      </div>
    </div>
  );
}
