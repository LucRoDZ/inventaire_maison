'use client';

import { useState } from 'react';
import { InAppBrowserNotice } from '../../components/scanner/InAppBrowserNotice';
import { ManualCodeInput } from '../../components/scanner/ManualCodeInput';
import { PhotoCodeButton } from '../../components/scanner/PhotoCodeButton';
import { ScannerView, type ScanMode } from '../../components/scanner/ScannerView';

export default function ScannerPage() {
  const [mode, setMode] = useState<ScanMode>('add');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">Scanner</h1>
      <ScannerView
        mode={mode}
        onModeChange={setMode}
        // The scan flow (tasks 1.17 and 1.20) takes over from here.
        onCode={() => undefined}
        fallbacks={
          <div className="flex flex-col gap-3">
            <InAppBrowserNotice />
            <ManualCodeInput onCode={() => undefined} />
            <PhotoCodeButton onCode={() => undefined} />
          </div>
        }
      />
    </main>
  );
}
