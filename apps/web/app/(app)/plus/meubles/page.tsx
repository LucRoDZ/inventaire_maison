'use client';

import { LocationsAdmin } from '../../../../components/admin/LocationsAdmin';
import { Screen } from '../../../../components/ui/Screen';

/** The furniture of the house: every account adds, renames, reorders and deletes its furniture. */
export default function MeublesPage() {
  return (
    <Screen title="Meubles et étagères" back={{ href: '/plus', label: 'Plus' }}>
      <LocationsAdmin />
    </Screen>
  );
}
