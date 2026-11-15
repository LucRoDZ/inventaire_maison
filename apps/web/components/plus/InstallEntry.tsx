'use client';

import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { currentEnv, installMode, requestInstallSheet, useInstallState } from '../../lib/install';

/** « Installer l'application » in Plus: hidden once installed or when the browser cannot. */
export function InstallEntry() {
  const { prompt, installed } = useInstallState();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(installMode(currentEnv(prompt !== null)) !== 'none');
  }, [prompt]);
  if (!available || installed) return null;
  return (
    <li>
      <button
        type="button"
        onClick={requestInstallSheet}
        className="tap-target border-line text-indigo flex w-full items-center gap-3 rounded-xl border bg-white px-4"
      >
        <Download size={20} aria-hidden="true" />
        <span className="flex-1 text-left font-bold">Installer l’application</span>
      </button>
    </li>
  );
}
