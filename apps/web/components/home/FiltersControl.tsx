'use client';

import type { CategoryDto } from '@inventaire/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { isFiltering, NO_FILTER, type HomeFilters as Filters } from '../../lib/home-filters';
import { HomeFilters } from './HomeFilters';

interface FiltersControlProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: CategoryDto[];
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea';

interface FiltersSheetProps extends FiltersControlProps {
  onClose: () => void;
}

/** Bottom sheet holding the search, the category chips and « Effacer les filtres ». */
export function FiltersSheet({ filters, onChange, categories, onClose }: FiltersSheetProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input[type=search]')?.focus();
  }, []);

  /** Échap closes; Tab and Maj+Tab go round inside the sheet. */
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="bg-indigo/40 fixed inset-0 z-30 flex items-end" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keyDown}
        className="rounded-card mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
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
    </div>
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
