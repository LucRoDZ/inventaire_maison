'use client';

import { useEffect, useState } from 'react';
import { listCameras, type CameraInfo } from '../../lib/scanner/camera';
import { readScannerSettings, writeScannerSettings } from '../../lib/scanner-settings';

/** Plus › Scanner: default camera and burst scan, kept on this device. */
export function ScannerSettings() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [burst, setBurst] = useState(true);

  useEffect(() => {
    const settings = readScannerSettings();
    setCameraId(settings.cameraId ?? '');
    setBurst(settings.burst);
    let cancelled = false;
    void listCameras().then((list) => {
      if (!cancelled) setCameras(list.filter((camera) => camera.id !== ''));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <section className="border-line flex flex-col gap-2 rounded-2xl border bg-white p-4">
        <label htmlFor="scanner-camera" className="text-indigo font-semibold">
          Caméra par défaut
        </label>
        <select
          id="scanner-camera"
          value={cameraId}
          onChange={(event) => {
            setCameraId(event.target.value);
            writeScannerSettings({ cameraId: event.target.value || null });
          }}
          className="border-line text-ink tap-target rounded-xl border bg-white px-3"
        >
          <option value="">Caméra arrière (automatique)</option>
          {cameras.map((camera) => (
            <option key={camera.id} value={camera.id}>
              {camera.label}
            </option>
          ))}
        </select>
        {cameras.length === 0 ? (
          <p className="text-small">
            Aucune caméra à proposer pour l’instant. Ouvrez le scanner une première fois et
            autorisez la caméra : la liste apparaîtra ici.
          </p>
        ) : null}
      </section>

      <section className="border-line flex items-start gap-3 rounded-2xl border bg-white p-4">
        <div className="flex-1">
          <p id="burst-label" className="text-indigo font-semibold">
            Scan en rafale
          </p>
          <p id="burst-help" className="text-small">
            Garde la caméra ouverte et ajoute chaque produit scanné à la suite, sans fermer la
            fiche. Pratique pour ranger tout un sac de courses.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={burst}
          aria-labelledby="burst-label"
          aria-describedby="burst-help"
          onClick={() => {
            setBurst(!burst);
            writeScannerSettings({ burst: !burst });
          }}
          className="tap-target inline-flex shrink-0 items-center"
        >
          <span
            aria-hidden="true"
            className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${burst ? 'bg-amber justify-end' : 'bg-line justify-start'}`}
          >
            <span className="h-5 w-5 rounded-full bg-white" />
          </span>
        </button>
      </section>
    </div>
  );
}
