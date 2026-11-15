'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ScanFlow } from '../../components/scanner/ScanFlow';

const positive = (value: string | null): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** `?lieu=2&etagere=21`: the scanner was opened from that furniture and shelf. */
function ScannerWithOrigin() {
  const params = useSearchParams();
  const locationId = positive(params.get('lieu'));
  const shelfId = positive(params.get('etagere'));
  return <ScanFlow origin={locationId ? { locationId, shelfId } : null} />;
}

export default function ScannerPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">Scanner</h1>
      <Suspense>
        <ScannerWithOrigin />
      </Suspense>
    </main>
  );
}
