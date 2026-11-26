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

const COUNTERS: { key: ExpiryFilter; label: string }[] = [
  { key: 'today', label: EXPIRY_FILTER_LABELS.today },
  { key: 'soon', label: EXPIRY_FILTER_LABELS.soon },
  { key: 'expired', label: EXPIRY_FILTER_LABELS.expired },
];

const TILE =
  'rounded-card border-line shadow-card flex min-h-16 flex-col justify-center border bg-white px-3 py-2 text-left';

/**
 * The four counters at the top of the scroll zone of the inventory: in stock, to eat today,
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
    <section aria-label="Résumé du stock" className="grid grid-cols-2 gap-2">
      <div className={TILE}>
        <span className="text-title tabular-nums">{summary?.inStock ?? '–'}</span>
        <span className="text-small">En stock</span>
      </div>
      {COUNTERS.map(({ key, label }) => {
        const pressed = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(pressed ? null : key)}
            className={`${TILE} tap-target transition-colors duration-150 ${
              pressed ? 'border-indigo bg-lavender' : 'hover:bg-lavender'
            }`}
          >
            <span className="text-title tabular-nums">{summary ? summary[key] : '–'}</span>
            <span className="text-small">{label}</span>
          </button>
        );
      })}
    </section>
  );
}
