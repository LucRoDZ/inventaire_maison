'use client';

import type { CategoryDto } from '@inventaire/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { isFiltering, NO_FILTER, type HomeFilters as Filters } from '../../lib/home-filters';
import { BottomSheet } from '../ui/BottomSheet';
import { HomeFilters } from './HomeFilters';

interface FiltersControlProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: CategoryDto[];
}

interface FiltersSheetProps extends FiltersControlProps {
  onClose: () => void;
}

/** Bottom sheet holding the search, the category chips and « Effacer les filtres ». */
export function FiltersSheet({ filters, onChange, categories, onClose }: FiltersSheetProps) {
  const titleId = useId();
  const holder = useRef<HTMLDivElement>(null);
  // The search field of HomeFilters receives the focus when the sheet opens.
  const initialFocus = {
    get current() {
      return holder.current?.querySelector<HTMLElement>('input[type=search]') ?? null;
    },
  };

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose} initialFocus={initialFocus}>
      <div ref={holder} className="contents">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-card-title">
            Filtres
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="tap-target text-indigo inline-flex items-center justify-center rounded-full"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <HomeFilters filters={filters} onChange={onChange} categories={categories} />
        <button
          type="button"
          onClick={() => onChange(NO_FILTER)}
          disabled={!isFiltering(filters)}
          className="tap-target bg-lavender text-indigo rounded-full px-4 font-bold disabled:opacity-50"
        >
          Effacer les filtres
        </button>
      </div>
    </BottomSheet>
  );
}

/**
 * The « Filtres » button (44 × 44, amber dot when a filter is on) and the sheet it opens. The state
 * stays the one of the URL: the caller passes it from useHomeFilters. Closed, the focus goes back
 * to the button.
 */
export function FiltersControl({ filters, onChange, categories }: FiltersControlProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const active = isFiltering(filters);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={active ? 'Filtres, actifs' : 'Filtres'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="tap-target text-indigo relative inline-flex shrink-0 items-center justify-center rounded-full"
      >
        <SlidersHorizontal size={22} aria-hidden="true" />
        {active ? (
          <span
            aria-hidden="true"
            data-testid="filters-dot"
            className="bg-amber border-white absolute top-2 right-2 h-3 w-3 rounded-full border-2"
          />
        ) : null}
      </button>
      {open ? (
        <FiltersSheet
          filters={filters}
          onChange={onChange}
          categories={categories}
          onClose={close}
        />
      ) : null}
    </>
  );
}

interface FilterReminderProps {
  filters: Filters;
  categories: CategoryDto[];
  onClear: () => void;
}

/** « Filtré : lait · Produits laitiers » under the top bar, with a button to clear. Nothing without a filter. */
export function FilterReminder({ filters, categories, onClear }: FilterReminderProps) {
  if (!isFiltering(filters)) return null;
  const category = categories.find((c) => c.id === filters.categoryId);
  const parts = [filters.q.trim(), category?.name].filter(Boolean);
  return (
    <div className="flex h-8 shrink-0 items-center gap-2">
      <p className="text-small min-w-0 flex-1 truncate">
        Filtré : <span className="text-indigo font-bold">{parts.join(' · ')}</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer les filtres"
        className="tap-target text-indigo -my-1.5 inline-flex shrink-0 items-center justify-center rounded-full"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
