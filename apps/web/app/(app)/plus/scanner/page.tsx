'use client';

import { ScannerSettings } from '../../../../components/plus/ScannerSettings';
import { Screen } from '../../../../components/ui/Screen';

export default function ScannerSettingsPage() {
  return (
    <Screen title="Scanner" back={{ href: '/plus', label: 'Plus' }}>
      <ScannerSettings />
    </Screen>
  );
}
