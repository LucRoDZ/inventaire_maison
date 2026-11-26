'use client';

import { StatsView } from '../../../../components/plus/StatsView';
import { Screen } from '../../../../components/ui/Screen';

export default function StatistiquesPage() {
  return (
    <Screen title="Statistiques" back={{ href: '/plus', label: 'Plus' }}>
      <StatsView />
    </Screen>
  );
}
