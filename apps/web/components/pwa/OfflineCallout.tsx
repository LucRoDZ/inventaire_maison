'use client';

import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/online';
import { Callout } from '../ui/Callout';

/** Shown while the device has no connection. Reading still works; adding and removing do not. */
export function OfflineCallout() {
  const online = useOnline();
  if (online) return null;
  return (
    <Callout role="status" icon={WifiOff} title="Pas de connexion">
      L’ajout et le retrait de produits sont indisponibles tant que vous êtes hors ligne.
    </Callout>
  );
}
