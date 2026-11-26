'use client';

import { PendingSyncView } from '../../../../../components/account/PendingSyncView';
import { Screen } from '../../../../../components/ui/Screen';

export default function SynchronisationPage() {
  return (
    <Screen title="À synchroniser" back={{ href: '/plus/compte', label: 'Compte' }}>
      <PendingSyncView />
    </Screen>
  );
}
