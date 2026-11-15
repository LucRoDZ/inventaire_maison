'use client';

import type { ReactNode } from 'react';
import { useCurrentUser } from '../auth/AuthProvider';
import { Callout } from '../ui/Callout';

/** Shows its children to the admin only; a member who opens the URL gets an explanation. */
export function AdminGate({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (user === null) {
    return (
      <p role="status" className="text-small">
        Chargement…
      </p>
    );
  }
  if (user.role !== 'admin') {
    return (
      <Callout role="alert" title="Accès réservé à l’administrateur">
        Demandez à l’administrateur de la maison pour cette action.
      </Callout>
    );
  }
  return <>{children}</>;
}
