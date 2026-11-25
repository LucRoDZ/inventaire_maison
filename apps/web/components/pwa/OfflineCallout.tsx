'use client';

import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/online';
import { Callout } from '../ui/Callout';

/**
 * Shown while the device has no connection: the inventory is read from the server only (nothing of
 * it is kept on the device), and nothing can be written.
 */
export function OfflineCallout() {
  const online = useOnline();
  if (online) return null;
  return (
    <Callout role="status" icon={WifiOff} title="Pas de connexion">
      L’ajout et le retrait de produits, comme les meubles, sont indisponibles et l’inventaire ne
      s’affiche pas tant que vous êtes hors ligne.
    </Callout>
  );
}
