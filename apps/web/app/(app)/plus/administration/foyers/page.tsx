'use client';

import { AdminGate } from '../../../../../components/admin/AdminGate';
import { HouseholdsAdmin } from '../../../../../components/admin/HouseholdsAdmin';
import { Screen } from '../../../../../components/ui/Screen';

export default function FoyersPage() {
  return (
    <Screen title="Foyers" back={{ href: '/plus/administration', label: 'Administration' }}>
      <AdminGate>
        <HouseholdsAdmin />
      </AdminGate>
    </Screen>
  );
}
