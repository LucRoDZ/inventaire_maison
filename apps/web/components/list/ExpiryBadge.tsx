import type { ExpiryStatus } from '@inventaire/shared';

export function expiryLabel(expiry: ExpiryStatus): string {
  if (expiry.status === 'expired') return 'Périmé';
  return expiry.days === 0 ? 'Aujourd’hui' : `J-${expiry.days}`;
}

/** Tinted amber for « J-3 » and « Aujourd'hui », tinted red for « Périmé »: always with the word, never colour alone. */
export function ExpiryBadge({ expiry }: { expiry: ExpiryStatus | null }) {
  if (!expiry) return null;
  const colors =
    expiry.status === 'expired'
      ? 'bg-alert-tint text-out-of-stock'
      : 'bg-expiry-soon-tint text-expiry-soon';
  return (
    <span
      className={`text-help inline-flex items-center mt-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${colors}`}
    >
      {expiryLabel(expiry)}
    </span>
  );
}
