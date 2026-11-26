'use client';

import { PushSetting } from '../../../../components/account/PushSetting';
import { PasswordForm } from '../../../../components/account/PasswordForm';
import { useCurrentUser } from '../../../../components/auth/AuthProvider';
import { Screen } from '../../../../components/ui/Screen';

export default function ComptePage() {
  const user = useCurrentUser();
  return (
    <Screen title="Compte" back={{ href: '/plus', label: 'Plus' }}>
      {user ? (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
          <dt className="text-grey">Pseudo</dt>
          <dd className="text-ink">{user.username}</dd>
          <dt className="text-grey">Rôle</dt>
          <dd className="text-ink">{user.role === 'admin' ? 'Administrateur' : 'Membre'}</dd>
        </dl>
      ) : null}
      {user ? <PushSetting userId={user.id} /> : null}
      <h2 className="text-card-title mt-2">Changer le mot de passe</h2>
      <PasswordForm />
    </Screen>
  );
}
