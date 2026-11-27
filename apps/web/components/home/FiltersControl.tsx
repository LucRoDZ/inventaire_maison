'use client';

import { STOCK_SORTS, type CategoryDto, type StockSort } from '@inventaire/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  activeFilterCount,
  clearPanelFilters,
  type HomeFilters as Filters,
} from '../../lib/home-filters';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { SearchField } from './SearchField';

export const SORT_LABELS: Record<StockSort, string> = {
  name: 'Nom',
  added: 'Date d’ajout',
  expiry: 'Date limite',
};

/**
 * Which filters the panel holds. `home`: the categories. `list`: the furniture, the categories and
 * the order. `furniture` (an open piece of furniture, without a search box on screen): the search
 * and the categories.
 */
export type FiltersMode = 'home' | 'list' | 'furniture';

/** A piece of furniture of the list filter, with its number of products. */
export interface LocationChoice {
  id: number;
  name: string;
  count: number;
}

interface FiltersSheetProps {
  mode: FiltersMode;
  filters: Filters;
  categories: CategoryDto[];
  /** List mode: « Tout » then one choice per piece of furniture. */
  locations?: LocationChoice[];
  /** Total of « Tout » (list mode). */
  total?: number;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}

const option =
  'tap-target border-line text-ink flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 has-[:checked]:border-indigo has-[:checked]:bg-lavender has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-mid';
const control = 'accent-indigo h-5 w-5 shrink-0 outline-none';

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-label mb-2">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const panelView = (mode: FiltersMode) => (mode === 'list' ? 'list' : 'home');

/**
 * The bottom sheet of the filters (pattern of the product sheet). The choices are a draft:
 * « Appliquer » writes them, closing without it changes nothing; « Réinitialiser » clears the
 * filters of this panel at once.
 */
export function FiltersSheet({
  mode,
  filters,
  categories,
  locations = [],
  total = 0,
  onApply,
  onClose,
}: FiltersSheetProps) {
  const titleId = useId();
  const name = useId();
  const [draft, setDraft] = useState(filters);
  const search = useRef<HTMLInputElement>(null);
  const toggleCategory = (id: number) =>
    setDraft((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter((c) => c !== id)
        : [...current.categoryIds, id],
    }));

  return (
    <BottomSheet
      labelledBy={titleId}
      onClose={onClose}
      initialFocus={mode === 'furniture' ? search : undefined}
      scrollable={false}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 id={titleId} className="text-subtitle">
          Filtres
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="tap-target text-indigo -mr-2 inline-flex items-center justify-center transition-[opacity,transform] duration-100 active:opacity-50 active:scale-[0.92] motion-reduce:active:scale-100"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <form
        id={`${name}-form`}
        className="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        {mode === 'furniture' ? (
          <SearchField
            inputRef={search}
            value={draft.q}
            onChange={(q) => setDraft((current) => ({ ...current, q }))}
          />
        ) : null}
        {mode === 'list' ? (
          <Group legend="Meuble">
            {[{ id: null, name: 'Tout', count: total }, ...locations].map((choice) => (
              <label key={choice.id ?? 'all'} className={option}>
                <input
                  type="radio"
                  name={`${name}-location`}
                  className={control}
                  checked={draft.locationId === choice.id}
                  onChange={() => setDraft((current) => ({ ...current, locationId: choice.id }))}
                />
                <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                <span className="text-small shrink-0">{choice.count}</span>
              </label>
            ))}
          </Group>
        ) : null}
        <Group legend="Catégories">
          {categories.map((category) => (
            <label key={category.id} className={option}>
              <input
                type="checkbox"
                className={control}
                checked={draft.categoryIds.includes(category.id)}
                onChange={() => toggleCategory(category.id)}
              />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
            </label>
          ))}
        </Group>
        {mode === 'list' ? (
          <Group legend="Tri">
            {STOCK_SORTS.map((sort) => (
              <label key={sort} className={option}>
                <input
                  type="radio"
                  name={`${name}-sort`}
                  className={control}
                  checked={draft.sort === sort}
                  onChange={() => setDraft((current) => ({ ...current, sort }))}
                />
                <span className="min-w-0 flex-1 truncate">{SORT_LABELS[sort]}</span>
              </label>
            ))}
          </Group>
        ) : null}
      </form>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const cleared = clearPanelFilters(filters, panelView(mode));
            onApply(mode === 'furniture' ? { ...cleared, q: '' } : cleared);
          }}
        >
          Réinitialiser
        </Button>
        <Button type="submit" form={`${name}-form`}>
          Appliquer
        </Button>
      </div>
    </BottomSheet>
  );
}

interface FiltersControlProps {
  mode: FiltersMode;
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: CategoryDto[];
  locations?: LocationChoice[];
  total?: number;
}

/**
 * The « Filtres » button (44 × 44; an amber badge gives the number of filters on) and the sheet it
 * opens. The state stays the one of the URL: the caller passes it from useHomeFilters. Closed, the
 * focus goes back to the button.
 */
export function FiltersControl({
  mode,
  filters,
  onChange,
  categories,
  locations,
  total,
}: FiltersControlProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const countId = useId();
  const count =
    activeFilterCount(filters, panelView(mode)) +
    (mode === 'furniture' && filters.q.trim() !== '' ? 1 : 0);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Filtres"
        aria-describedby={count > 0 ? countId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="tap-target text-indigo relative inline-flex shrink-0 items-center justify-center transition-[opacity,transform] duration-100 active:opacity-50 active:scale-[0.92] motion-reduce:active:scale-100"
      >
        <SlidersHorizontal size={22} aria-hidden="true" />
        {count > 0 ? (
          <span
            data-testid="filters-badge"
            aria-hidden="true"
            className="bg-amber text-on-amber text-help absolute top-0.5 right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 font-semibold"
          >
            {count}
          </span>
        ) : null}
      </button>
      {count > 0 ? (
        <span id={countId} hidden>
          {count > 1 ? `${count} filtres actifs` : '1 filtre actif'}
        </span>
      ) : null}
      {open ? (
        <FiltersSheet
          mode={mode}
          filters={filters}
          categories={categories}
          locations={locations}
          total={total}
          onApply={(next) => {
            onChange(next);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

interface FilterReminderProps {
  /** « Frigo · Boissons ». Empty: no line at all. */
  summary: string;
  onClear: () => void;
}

/** One line of 32 px that recalls the filters on, with « Effacer ». Nothing without a filter. */
export function FilterReminder({ summary, onClear }: FilterReminderProps) {
  if (summary === '') return null;
  return (
    <div className="flex h-8 shrink-0 items-center gap-2" data-testid="filter-reminder">
      <p className="text-small min-w-0 flex-1 truncate">
        <span className="sr-only">Filtres : </span>
        <span className="text-indigo font-semibold">{summary}</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer les filtres"
        className="tap-target text-indigo-mid -my-1.5 -mr-2 inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2 font-semibold"
      >
        Effacer
      </button>
    </div>
  );
}
