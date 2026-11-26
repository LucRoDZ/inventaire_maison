'use client';

import { Suspense } from 'react';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { MappingsAdmin } from '../../../../../components/admin/MappingsAdmin';
import { HouseholdScope } from '../../../../../components/admin/HouseholdScope';
import { categoriesApiFor } from '../../../../../lib/categories-api';
import { Screen } from '../../../../../components/ui/Screen';

export default function Page() {
  return (
    <Screen
      title="Correspondances Open Food Facts"
      back={{ href: '/plus/administration', label: 'Administration' }}
    >
      <AdminGate>
        <Suspense>
          <HouseholdScope>
            {(household) => <MappingsAdmin api={categoriesApiFor(household.id)} />}
          </HouseholdScope>
        </Suspense>
      </AdminGate>
    </Screen>
  );
}
