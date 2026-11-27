'use client';

import { Check, Download } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  currentEnv,
  installMode,
  promptInstall,
  useInstallState,
  type InstallMode,
} from '../../lib/install';
import { Button } from '../ui/Button';
import { BottomSheet } from '../ui/BottomSheet';
import { IosInstallSteps } from '../pwa/IosInstallSteps';

const ROW =
  'tap-target border-line text-indigo flex w-full items-center gap-3 rounded-xl border bg-white px-4 text-left';

function CopyLink() {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      // silent failure: the link below stays selectable
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => void copy()}>
        Copier le lien
      </Button>
      <p className="text-indigo-mid text-small break-all select-all">{origin}</p>
      <p role="status" className="text-indigo text-small">
        {copied ? 'Lien copié' : ''}
      </p>
    </div>
  );
}

function HelpSheet({ mode, onClose }: { mode: InstallMode; onClose: () => void }) {
  const titleId = useId();
  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-indigo text-lg font-bold">
        Installer l’application
      </h2>
      {mode === 'ios' ? <IosInstallSteps /> : null}
      {mode === 'ios-other' ? (
        <>
          <p>Ouvrez l’application dans Safari pour l’installer.</p>
          <CopyLink />
        </>
      ) : null}
      {mode !== 'ios' && mode !== 'ios-other' ? (
        <>
          <p>
            Ouvrez le menu ⋮ du navigateur puis « Installer l’application » ou « Ajouter à l’écran
            d’accueil ».
          </p>
          <CopyLink />
        </>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Fermer
      </Button>
    </BottomSheet>
  );
}

/** « Installer l'application » in Plus: always shown; tells when the app is installed already. */
export function InstallEntry() {
  const { prompt, installed } = useInstallState();
  const [standalone, setStandalone] = useState(false);
  const [mode, setMode] = useState<InstallMode>('none');
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const env = currentEnv(prompt !== null);
    setStandalone(env.standalone);
    setMode(installMode(env));
  }, [prompt]);

  if (installed || standalone) {
    return (
      <li>
        <div className={ROW}>
          <Check size={20} aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">Application installée</span>
            <span className="text-indigo-mid text-small block">
              Disponible sur l’écran d’accueil
            </span>
          </span>
        </div>
      </li>
    );
  }

  const click = () => {
    if (prompt !== null) void promptInstall();
    else setHelp(true);
  };

  return (
    <li>
      <button type="button" onClick={click} className={ROW}>
        <Download size={20} aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-semibold">Installer l’application</span>
          <span className="text-indigo-mid text-small block">
            Ajoutez l’application à l’écran d’accueil pour l’ouvrir comme une app.
          </span>
        </span>
      </button>
      {help ? <HelpSheet mode={mode} onClose={() => setHelp(false)} /> : null}
    </li>
  );
}
