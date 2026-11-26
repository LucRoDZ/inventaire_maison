'use client';

import { HapticsSetting } from '../../../../components/account/HapticsSetting';
import { ThemeSetting } from '../../../../components/account/ThemeSetting';
import { PushSetting } from '../../../../components/account/PushSetting';
import { PasswordForm } from '../../../../components/account/PasswordForm';
import { useCurrentUser } from '../../../../components/auth/AuthProvider';
import { PendingSyncBadge } from '../../../../lib/offline';
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
      <div>
        <PendingSyncBadge />
      </div>
      {user ? <PushSetting dataScope={user.dataScope} /> : null}
      <ThemeSetting />
      <HapticsSetting />
      <h2 className="text-card-title mt-2">Changer le mot de passe</h2>
      <PasswordForm />
    </Screen>
  );
}
