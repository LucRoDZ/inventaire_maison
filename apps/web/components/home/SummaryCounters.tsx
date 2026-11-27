'use client';

import type { ExpiryFilter, StockSummaryDto } from '@inventaire/shared';
import { useEffect, useRef, useState } from 'react';
import { EXPIRY_FILTER_LABELS } from '../../lib/home-filters';
import { fetchStockSummary } from '../../lib/stock-api';

interface SummaryCountersProps {
  /** The expiry filter of the URL. */
  active: ExpiryFilter | null;
  /** Tapping the active counter again clears the filter. */
  onSelect: (filter: ExpiryFilter | null) => void;
  /** Changes when the stock changed elsewhere on the screen: the counters are loaded again. */
  version?: number;
  /** Test seam. */
  load?: () => Promise<StockSummaryDto>;
}

const COUNTERS: { key: ExpiryFilter; label: string; short: string }[] = [
  { key: 'today', label: EXPIRY_FILTER_LABELS.today, short: 'Aujourd’hui' },
  { key: 'soon', label: EXPIRY_FILTER_LABELS.soon, short: 'Bientôt' },
  { key: 'expired', label: EXPIRY_FILTER_LABELS.expired, short: 'Périmés' },
];

const TILE =
  'rounded-card border-line bg-surface-raised flex min-h-16 min-w-0 flex-col items-center justify-center border px-0.5 py-2 text-center';
const NUMBER = 'text-number';
const CAPTION = 'text-help text-grey block max-w-full';

function tone(key: ExpiryFilter, count: number | string): string {
  if (typeof count === 'number' && count > 0) {
    if (key === 'expired') return 'text-alert';
    if (key === 'soon') return 'text-expiry-soon';
  }
  return 'text-ink';
}

/**
 * The four counters in the fixed header of the inventory, on one row: in stock, to eat today,
 * soon, expired. The last three are buttons that set the expiry filter of the URL.
 */
export function SummaryCounters({
  active,
  onSelect,
  version = 0,
  load = fetchStockSummary,
}: SummaryCountersProps) {
  const [summary, setSummary] = useState<StockSummaryDto | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loader
      .current()
      .then((loaded) => {
        if (!cancelled) setSummary(loaded);
      })
      .catch(() => undefined); // The counters are an extra: the list still works without them.
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <section aria-label="Résumé du stock" className="grid grid-cols-4 items-stretch gap-1.5">
      <div className={TILE}>
        <span className={`${NUMBER} text-ink`}>{summary?.inStock ?? '–'}</span>
        <span className={CAPTION}>En stock</span>
      </div>
      {COUNTERS.map(({ key, label, short }) => {
        const pressed = active === key;
        const count = summary ? summary[key] : '–';
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(pressed ? null : key)}
            className={`${TILE} tap-target transition-colors duration-150 ${
              pressed ? 'ring-indigo ring-[1.5px] ring-inset' : ''
            }`}
          >
            <span className={`${NUMBER} ${tone(key, count)}`}>{count}</span>{' '}
            {/* No aria-label (it would hide the visible text from voice control): the full label
                is read through a hidden prefix, the visible short label stays in the name. */}
            <span className={CAPTION}>
              {label !== short ? <span className="sr-only">{`${label}, `}</span> : null}
              {short}
            </span>
          </button>
        );
      })}
    </section>
  );
}
