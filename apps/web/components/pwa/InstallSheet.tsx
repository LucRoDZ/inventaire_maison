'use client';

import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  closeInstallSheet,
  currentEnv,
  dismissForever,
  installMode,
  promptInstall,
  readDismissal,
  shouldShowInstall,
  snooze,
  useInstallState,
  type Dismissal,
  type InstallMode,
} from '../../lib/install';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { BrowserInstallHelp } from './BrowserInstallHelp';
import { IosInstallSteps } from './IosInstallSteps';

/** Bottom sheet inviting to install the app; mounted in the signed-in shell only. */
export function InstallSheet() {
  const { prompt, installed, forced } = useInstallState();
  const [mode, setMode] = useState<InstallMode>('none');
  const [dismissal, setDismissal] = useState<Dismissal>(null);
  const [now, setNow] = useState(0);

  // Browser-only facts are read after mount, so that the server render stays empty.
  useEffect(() => {
    setMode(installMode(currentEnv(prompt !== null)));
    setDismissal(readDismissal(window.localStorage));
    setNow(Date.now());
  }, [prompt, forced]);

  if (!shouldShowInstall({ mode, dismissal, now, forced, installed })) return null;

  const later = () => {
    snooze(window.localStorage, Date.now());
    setDismissal(readDismissal(window.localStorage));
    closeInstallSheet();
  };
  const never = () => {
    dismissForever(window.localStorage);
    setDismissal(readDismissal(window.localStorage));
    closeInstallSheet();
  };

  return (
    <div
      role="dialog"
      aria-label="Installer l’application"
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-xl px-4"
    >
      <div className="shadow-card rounded-card">
        <Callout icon={Download} title="Installer l’application">
          {mode === 'prompt' ? (
            <p>
              Ajoutez Inventaire maison à votre écran d’accueil pour l’ouvrir comme une application.
            </p>
          ) : null}
          {mode === 'ios' ? <IosInstallSteps /> : null}
          {mode === 'firefox-android' ? <BrowserInstallHelp /> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {mode === 'prompt' ? (
              <Button variant="add" onClick={() => void promptInstall()}>
                Installer
              </Button>
            ) : null}
            <Button variant="secondary" onClick={later}>
              Plus tard
            </Button>
            <Button variant="secondary" onClick={never}>
              Ne plus afficher
            </Button>
          </div>
        </Callout>
      </div>
    </div>
  );
}
