'use client';

import type {
  CategoryDto,
  LocationCountDto,
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  StockListItemDto,
  StockListResponse,
  StockSort,
} from '@inventaire/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  adjustStock,
  fetchCategories,
  fetchLocations,
  fetchStock,
  type StockFilters,
} from '../../lib/stock-api';
import { Callout } from '../ui/Callout';
import { CategorySection } from './CategorySection';
import { ListToolbar } from './ListToolbar';
import { LocationTabs } from './LocationTabs';

const SEARCH_DELAY_MS = 300;

interface ListViewProps {
  /** Test seams. */
  api?: {
    fetchStock?: (filters: StockFilters) => Promise<StockListResponse>;
    fetchLocations?: () => Promise<LocationDto[]>;
    fetchCategories?: () => Promise<CategoryDto[]>;
    adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  };
}

export function ListView({ api = {} }: ListViewProps) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [items, setItems] = useState<StockListItemDto[] | null>(null);
  const [counts, setCounts] = useState<LocationCountDto[]>([]);
  const [location, setLocation] = useState<number | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [sort, setSort] = useState<StockSort>('name');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void Promise.all([
      (apiRef.current.fetchLocations ?? fetchLocations)(),
      (apiRef.current.fetchCategories ?? fetchCategories)(),
    ])
      .then(([loadedLocations, loadedCategories]) => {
        setLocations(loadedLocations);
        setCategories(loadedCategories);
      })
      .catch(() => setError('Impossible de charger les lieux et les catégories.'));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await (apiRef.current.fetchStock ?? fetchStock)({
        location: location ?? undefined,
        category: category ?? undefined,
        q: debounced || undefined,
        sort,
      });
      setItems(response.items);
      setCounts(response.counts);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Impossible de charger l’inventaire : vérifiez la connexion.',
      );
    }
  }, [location, category, debounced, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistic: the card changes at once and goes back to its old value if the server refuses. */
  const change = async (item: StockListItemDto, delta: 1 | -1) => {
    const next = item.quantity + delta;
    setError(null);
    setItems((current) =>
      (current ?? []).flatMap((line) =>
        line.id !== item.id ? [line] : next <= 0 ? [] : [{ ...line, quantity: next }],
      ),
    );
    try {
      await (apiRef.current.adjust ?? adjustStock)({
        productId: item.product.id,
        locationId: item.location.id,
        shelfId: item.shelf?.id ?? null,
        expiryDate: item.expiryDate,
        delta,
        reason: 'manual',
      });
      void load(); // counters and order follow the server
    } catch (caught) {
      setItems((current) => {
        const list = current ?? [];
        return list.some((line) => line.id === item.id)
          ? list.map((line) => (line.id === item.id ? item : line))
          : [...list, item];
      });
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Modification impossible : vérifiez la connexion.',
      );
    }
  };

  const sections = useMemo(() => {
    const byCategory = new Map<number, StockListItemDto[]>();
    for (const item of items ?? []) {
      byCategory.set(item.category.id, [...(byCategory.get(item.category.id) ?? []), item]);
    }
    return categories
      .filter((c) => byCategory.has(c.id))
      .map((c) => ({ category: c, items: byCategory.get(c.id) ?? [] }));
  }, [items, categories]);

  const products = new Set((items ?? []).map((item) => item.product.id)).size;
  const units = (items ?? []).reduce((sum, item) => sum + item.quantity, 0);
  const filtering = debounced !== '' || category !== null;

  return (
    <div className="flex flex-col gap-4">
      <LocationTabs locations={locations} counts={counts} value={location} onChange={setLocation} />
      <ListToolbar
        query={query}
        onQuery={setQuery}
        categories={categories}
        category={category}
        onCategory={setCategory}
        sort={sort}
        onSort={setSort}
      />

      {error ? (
        <Callout role="alert" title="Un instant">
          {error}
        </Callout>
      ) : null}

      {items === null ? (
        <p role="status" className="text-small">
          Chargement…
        </p>
      ) : (
        <>
          <p role="status" className="text-small">
            {products} {products > 1 ? 'articles' : 'article'} · {units}{' '}
            {units > 1 ? 'unités' : 'unité'}
          </p>
          {items.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <Callout role="note" title={filtering ? 'Aucun résultat' : 'Rien ici pour l’instant'}>
                {filtering
                  ? 'Aucun produit ne correspond à ces filtres.'
                  : 'Scannez un premier produit pour remplir l’inventaire.'}
              </Callout>
              {!filtering ? (
                <Link
                  href="/"
                  className="tap-target bg-amber text-indigo inline-flex items-center rounded-xl px-4 font-bold"
                >
                  Scanner un produit
                </Link>
              ) : null}
            </div>
          ) : (
            sections.map(({ category: section, items: lines }) => (
              <CategorySection
                key={section.id}
                name={section.name}
                items={lines}
                onChange={(i, d) => void change(i, d)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
