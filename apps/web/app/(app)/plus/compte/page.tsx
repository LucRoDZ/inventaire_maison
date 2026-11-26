'use client';

import { PasswordForm } from '../../../../components/account/PasswordForm';
import { useCurrentUser } from '../../../../components/auth/AuthProvider';
import { Screen } from '../../../../components/ui/Screen';

export default function ComptePage() {
  const user = useCurrentUser();
  return (
    <Screen title="Compte" back={{ href: '/plus', label: 'Plus' }}>
      {user ? (
        <dl className="flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="text-label">Pseudo</dt>
            <dd>{user.username}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-label">Rôle</dt>
            <dd>{user.role === 'admin' ? 'Administrateur' : 'Membre'}</dd>
          </div>
        </dl>
      ) : null}
      <h2 className="text-label">Changer le mot de passe</h2>
      <PasswordForm />
    </Screen>
  );
}
