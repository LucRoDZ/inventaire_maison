'use client';

import { Suspense } from 'react';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { HouseholdScope } from '../../../../../components/admin/HouseholdScope';
import { SettingsAdmin } from '../../../../../components/admin/SettingsAdmin';
import { Screen } from '../../../../../components/ui/Screen';
import { settingsApiFor } from '../../../../../lib/settings-api';

export default function Page() {
  return (
    <Screen
      title="Alertes de péremption"
      back={{ href: '/plus/administration', label: 'Administration' }}
    >
      <AdminGate>
        <Suspense>
          <HouseholdScope>
            {(household) => <SettingsAdmin api={settingsApiFor(household.id)} />}
          </HouseholdScope>
        </Suspense>
      </AdminGate>
    </Screen>
  );
}
