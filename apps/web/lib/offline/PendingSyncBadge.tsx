'use client';

import Link from 'next/link';
import { usePendingCount } from './runtime';

export const PENDING_SYNC_HREF = '/plus/compte/synchronisation';

/** « À synchroniser (n) » : leads to the screen of the waiting operations; hidden at 0. */
export function PendingSyncBadge({ className = '' }: { className?: string }) {
  const count = usePendingCount();
  if (count === 0) return null;
  return (
    <Link
      href={PENDING_SYNC_HREF}
      className={`tap-target inline-flex items-center justify-center ${className}`}
    >
      {/* The pill stays compact; the link around it is the 44 px touch target. */}
      <span className="bg-amber text-on-amber text-small inline-flex min-h-8 items-center rounded-full px-3 font-semibold">
        À synchroniser ({count})
      </span>
    </Link>
  );
}
