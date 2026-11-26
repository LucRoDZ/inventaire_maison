'use client';

import { AdminGate } from '../../../../../components/admin/AdminGate';
import { MembersAdmin } from '../../../../../components/admin/MembersAdmin';
import { useCurrentUser } from '../../../../../components/auth/AuthProvider';
import { Screen } from '../../../../../components/ui/Screen';

export default function MembresPage() {
  const user = useCurrentUser();
  return (
    <Screen title="Comptes" back={{ href: '/plus/administration', label: 'Administration' }}>
      <AdminGate>{user ? <MembersAdmin currentUserId={user.id} /> : null}</AdminGate>
    </Screen>
  );
}
