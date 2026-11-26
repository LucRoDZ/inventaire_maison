import type { ExpiryStatus } from '@inventaire/shared';

export function expiryLabel(expiry: ExpiryStatus): string {
  if (expiry.status === 'expired') return 'Périmé';
  return expiry.days === 0 ? 'Aujourd’hui' : `J-${expiry.days}`;
}

/** Amber for « J-3 » and « Aujourd'hui », red for « Périmé »: always with the word, never colour alone. */
export function ExpiryBadge({ expiry }: { expiry: ExpiryStatus | null }) {
  if (!expiry) return null;
  const colors = expiry.status === 'expired' ? 'bg-alert text-white' : 'bg-amber text-indigo';
  return (
    <span
      className={`text-help inline-flex items-center rounded-full px-2 py-0.5 font-semibold tabular-nums ${colors}`}
    >
      {expiryLabel(expiry)}
    </span>
  );
}
