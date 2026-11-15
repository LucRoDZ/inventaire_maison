'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '../../lib/auth';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    try {
      await logout();
      router.replace('/connexion');
      router.refresh();
    } catch {
      setError('La déconnexion a échoué. Réessayez.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout role="alert">{error}</Callout> : null}
      <Button variant="secondary" onClick={onClick}>
        <LogOut size={18} aria-hidden="true" />
        Se déconnecter
      </Button>
    </div>
  );
}
