'use client';

import { addDaysIso, addMonthsIso, longDate, relativeDays, todayIso } from '../../lib/dates';

const CHIPS = [
  { label: '+3 j', name: 'dans 3 jours', add: (from: string) => addDaysIso(from, 3) },
  { label: '+1 sem', name: 'dans 1 semaine', add: (from: string) => addDaysIso(from, 7) },
  { label: '+1 mois', name: 'dans 1 mois', add: (from: string) => addMonthsIso(from, 1) },
] as const;

interface ExpiryChipsProps {
  /** The date limit now (`YYYY-MM-DD`), empty when none. */
  value: string;
  /** A chip was chosen: the date it stands for. */
  onPick: (iso: string) => void;
  /** Test seam: today. */
  today?: string;
}

/**
 * Quick expiry dates counted from today, and the date chosen said in relative terms (« dans 3
 * jours ») with the exact date kept for screen readers.
 */
export function ExpiryChips({ value, onPick, today = todayIso() }: ExpiryChipsProps) {
  const relative = value ? relativeDays(value, today) : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHIPS.map((chip) => {
        const iso = chip.add(today);
        return (
          <button
            key={chip.label}
            type="button"
            aria-label={`${chip.label}, date limite ${chip.name}`}
            aria-pressed={value === iso}
            onClick={() => onPick(iso)}
            className="tap-target border-line text-indigo hover:bg-lavender aria-pressed:bg-lavender inline-flex items-center rounded-full border bg-white px-4 font-semibold tabular-nums transition-colors duration-150"
          >
            {chip.label}
          </button>
        );
      })}
      {relative ? (
        <time dateTime={value} className="text-help tabular-nums">
          <span aria-hidden="true">{relative}</span>
          <span className="sr-only">{longDate(value)}</span>
        </time>
      ) : null}
    </div>
  );
}
