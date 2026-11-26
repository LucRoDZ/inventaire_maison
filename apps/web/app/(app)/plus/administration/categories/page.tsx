'use client';

import { Suspense } from 'react';
import { AdminGate } from '../../../../../components/admin/AdminGate';
import { CategoriesAdmin } from '../../../../../components/admin/CategoriesAdmin';
import { HouseholdScope } from '../../../../../components/admin/HouseholdScope';
import { categoriesApiFor } from '../../../../../lib/categories-api';
import { Screen } from '../../../../../components/ui/Screen';

export default function Page() {
  return (
    <Screen title="Catégories" back={{ href: '/plus/administration', label: 'Administration' }}>
      <AdminGate>
        <Suspense>
          <HouseholdScope>
            {(household) => <CategoriesAdmin api={categoriesApiFor(household.id)} />}
          </HouseholdScope>
        </Suspense>
      </AdminGate>
    </Screen>
  );
}
