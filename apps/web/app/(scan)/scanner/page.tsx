'use client';

import { PendingSyncBadge } from '../../../lib/offline';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ScanFlow } from '../../../components/scanner/ScanFlow';

const positive = (value: string | null): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** `?lieu=2&etagere=21`: the scanner was opened from that furniture and shelf. */
function ScannerWithOrigin() {
  const params = useSearchParams();
  const router = useRouter();
  const locationId = positive(params.get('lieu'));
  const shelfId = positive(params.get('etagere'));
  const close = () => {
    if (window.history.length > 1) router.back();
    else router.replace('/inventaire');
  };
  return (
    <ScanFlow
      origin={locationId ? { locationId, shelfId } : null}
      onClose={close}
      statusSlot={<PendingSyncBadge />}
    />
  );
}

export default function ScannerPage() {
  return (
    <Suspense>
      <ScannerWithOrigin />
    </Suspense>
  );
}
