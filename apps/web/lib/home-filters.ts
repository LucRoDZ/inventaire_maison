'use client';

import type { HomeLocationDto, HomeTileDto } from '@inventaire/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export interface HomeFilters {
  q: string;
  /** Null: every category. */
  categoryId: number | null;
}

export const NO_FILTER: HomeFilters = { q: '', categoryId: null };

/** Lower case, no accents: « Écrémé » finds « ecreme ». */
export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const isFiltering = (filters: HomeFilters): boolean =>
  normalize(filters.q) !== '' || filters.categoryId !== null;

export function parseFilters(params: URLSearchParams): HomeFilters {
  const category = Number(params.get('cat'));
  return {
    q: params.get('q') ?? '',
    categoryId: Number.isInteger(category) && category > 0 ? category : null,
  };
}

/** `?q=lait&cat=3`, or an empty string: the filter travels in the URL, so it survives opening a furniture. */
export function filtersToQuery(filters: HomeFilters): string {
  const params = new URLSearchParams();
  if (normalize(filters.q) !== '') params.set('q', filters.q.trim());
  if (filters.categoryId !== null) params.set('cat', String(filters.categoryId));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function tileMatches(tile: HomeTileDto, filters: HomeFilters): boolean {
  const term = normalize(filters.q);
  if (term !== '' && !normalize(`${tile.name} ${tile.brand ?? ''}`).includes(term)) return false;
  return filters.categoryId === null || tile.category.id === filters.categoryId;
}

export const locationTiles = (location: HomeLocationDto): HomeTileDto[] => [
  ...location.shelves.flatMap((shelf) => shelf.tiles),
  ...location.unshelved,
];

/** The furniture holds at least one line that passes the filters. */
export const locationMatches = (location: HomeLocationDto, filters: HomeFilters): boolean =>
  locationTiles(location).some((tile) => tileMatches(tile, filters));

/** The filters of the URL and a setter that rewrites it without adding history entries. */
export function useHomeFilters(): [HomeFilters, (next: HomeFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const set = useCallback(
    (next: HomeFilters) => router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false }),
    [router, pathname],
  );
  return [filters, set];
}
