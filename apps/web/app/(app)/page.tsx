'use client';

import { ScanFlow } from '../../components/scanner/ScanFlow';

export default function ScannerPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">Scanner</h1>
      <ScanFlow />
    </main>
  );
}
