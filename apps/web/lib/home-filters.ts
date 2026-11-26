'use client';

import {
  STOCK_SORTS,
  type CategoryDto,
  type HomeLocationDto,
  type HomeTileDto,
  type StockSort,
} from '@inventaire/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * The search and the filters of the inventory. They live in the URL, so they survive a switch
 * between the views, opening a piece of furniture and coming back.
 */
export interface HomeFilters {
  q: string;
  /** Empty: every category. */
  categoryIds: number[];
  /** List view only. Null: every piece of furniture. */
  locationId: number | null;
  /** List view only. */
  sort: StockSort;
}

export const DEFAULT_SORT: StockSort = 'name';

export const NO_FILTER: HomeFilters = {
  q: '',
  categoryIds: [],
  locationId: null,
  sort: DEFAULT_SORT,
};

/** The two views of the inventory; each one has its own filters (the search is shared). */
export type InventoryView = 'home' | 'list';

/** Lower case, no accents: « Écrémé » finds « ecreme ». */
export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** A search or a category: what does not match fades (house, open furniture). */
export const isFiltering = (filters: HomeFilters): boolean =>
  normalize(filters.q) !== '' || filters.categoryIds.length > 0;

/** Filters of the panel that are on for this view (the badge of the button). The search is not one. */
export const activeFilterCount = (filters: HomeFilters, view: InventoryView): number =>
  filters.categoryIds.length + (view === 'list' && filters.locationId !== null ? 1 : 0);

/** The same filters with those of the panel of this view cleared (search and other view kept). */
export const clearPanelFilters = (filters: HomeFilters, view: InventoryView): HomeFilters => ({
  ...filters,
  categoryIds: [],
  ...(view === 'list' ? { locationId: null, sort: DEFAULT_SORT } : {}),
});

/** « Frigo · Boissons »: what the reminder line under the search says. */
export function filterSummary(
  filters: HomeFilters,
  view: InventoryView,
  categories: readonly CategoryDto[],
  locations: readonly { id: number; name: string }[],
): string {
  const location =
    view === 'list' && filters.locationId !== null
      ? locations.find((l) => l.id === filters.locationId)?.name
      : undefined;
  const names = filters.categoryIds.map((id) => categories.find((c) => c.id === id)?.name);
  return [location, ...names].filter(Boolean).join(' · ');
}

const positive = (text: string | null): number | null => {
  const n = Number(text);
  return text !== null && text !== '' && Number.isInteger(n) && n > 0 ? n : null;
};

export function parseFilters(params: URLSearchParams): HomeFilters {
  const categoryIds = [
    ...new Set(
      (params.get('cat') ?? '')
        .split(',')
        .map(positive)
        .filter((id): id is number => id !== null),
    ),
  ];
  const sort = params.get('tri');
  return {
    q: params.get('q') ?? '',
    categoryIds,
    locationId: positive(params.get('meuble')),
    sort: (STOCK_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as StockSort)
      : DEFAULT_SORT,
  };
}

const FILTER_KEYS = ['q', 'cat', 'meuble', 'tri'] as const;

/** Writes the filters into the parameters given, leaving the others (view…) alone. */
function writeFilters(params: URLSearchParams, filters: HomeFilters): URLSearchParams {
  for (const key of FILTER_KEYS) params.delete(key);
  if (normalize(filters.q) !== '') params.set('q', filters.q.trim());
  if (filters.categoryIds.length > 0) params.set('cat', filters.categoryIds.join(','));
  if (filters.locationId !== null) params.set('meuble', String(filters.locationId));
  if (filters.sort !== DEFAULT_SORT) params.set('tri', filters.sort);
  return params;
}

/** `?q=lait&cat=3,5`, or an empty string: the filters follow into an opened furniture. */
export function filtersToQuery(filters: HomeFilters): string {
  const text = writeFilters(new URLSearchParams(), filters).toString();
  return text ? `?${text}` : '';
}

export function tileMatches(tile: HomeTileDto, filters: HomeFilters): boolean {
  const term = normalize(filters.q);
  if (term !== '' && !normalize(`${tile.name} ${tile.brand ?? ''}`).includes(term)) return false;
  return filters.categoryIds.length === 0 || filters.categoryIds.includes(tile.category.id);
}

export const locationTiles = (location: HomeLocationDto): HomeTileDto[] => [
  ...location.shelves.flatMap((shelf) => shelf.tiles),
  ...location.unshelved,
];

/** The furniture holds at least one line that passes the filters. */
export const locationMatches = (location: HomeLocationDto, filters: HomeFilters): boolean =>
  locationTiles(location).some((tile) => tileMatches(tile, filters));

/** The view of the URL (`?vue=liste`), the house by default. */
export const parseView = (params: URLSearchParams): InventoryView =>
  params.get('vue') === 'liste' ? 'list' : 'home';

/** Rewrites the URL without adding history entries and without scrolling. */
function useReplaceParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (edit: (draft: URLSearchParams) => void) => {
      const draft = new URLSearchParams(params.toString());
      edit(draft);
      const text = draft.toString();
      router.replace(`${pathname}${text ? `?${text}` : ''}`, { scroll: false });
    },
    [params, router, pathname],
  );
}

/** The filters of the URL and a setter that rewrites them, keeping every other parameter. */
export function useHomeFilters(): [HomeFilters, (next: HomeFilters) => void] {
  const params = useSearchParams();
  const replace = useReplaceParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const set = useCallback(
    (next: HomeFilters) => replace((draft) => void writeFilters(draft, next)),
    [replace],
  );
  return [filters, set];
}

/** The view of the URL and a setter that keeps the search and the filters. */
export function useInventoryView(): [InventoryView, (next: InventoryView) => void] {
  const params = useSearchParams();
  const replace = useReplaceParams();
  const view = parseView(new URLSearchParams(params.toString()));
  const set = useCallback(
    (next: InventoryView) =>
      replace((draft) => {
        if (next === 'list') draft.set('vue', 'liste');
        else draft.delete('vue');
      }),
    [replace],
  );
  return [view, set];
}
