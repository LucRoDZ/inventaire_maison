'use client';

import type {
  CategoryDto,
  LocationDto,
  RemovalReason,
  StockAdjustInput,
  StockAdjustResponse,
  StockListItemDto,
  StockListResponse,
  StockMoveInput,
  StockMoveResponse,
} from '@inventaire/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { NO_FILTER, type HomeFilters } from '../../lib/home-filters';
import {
  adjustStock,
  fetchCategories,
  fetchLocations,
  fetchStock,
  type StockFilters,
} from '../../lib/stock-api';
import type { LocationChoice } from '../home/FiltersControl';
import { RemovalToast, type RemovalPlan, removalKey } from '../add/RemovalToast';
import { UndoToast } from '../add/UndoToast';
import { Callout } from '../ui/Callout';
import { ErrorMessage } from '../ui/ErrorMessage';
import { EmptyFurnitureIllustration } from '../ui/Illustrations';
import { ListSkeleton } from '../ui/Skeleton';
import { MoveDialog } from '../home/MoveDialog';
import { BatchBar } from './BatchBar';
import { CategorySection } from './CategorySection';

const SEARCH_DELAY_MS = 300;

/** What the filter panel of the list offers: each piece of furniture and its number of products. */
export interface ListSummary {
  locations: LocationChoice[];
  total: number;
}

interface ListViewProps {
  /** The search and the filters of the URL (search, furniture, categories, order). */
  filters?: HomeFilters;
  /** Called once the stock changed (a quantity edited), for the counters of the screen. */
  onStockChanged?: () => void;
  /** Called when the furniture or their counts change, for the filter panel. */
  onSummary?: (summary: ListSummary) => void;
  /** Test seams. */
  api?: {
    fetchStock?: (filters: StockFilters) => Promise<StockListResponse>;
    fetchLocations?: () => Promise<LocationDto[]>;
    fetchCategories?: () => Promise<CategoryDto[]>;
    adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
    move?: (input: StockMoveInput) => Promise<StockMoveResponse>;
  };
}

const moveSource = (item: StockListItemDto) => ({
  stockItemId: item.id,
  productName: item.product.name,
  locationId: item.location.id,
  shelfId: item.shelf?.id ?? null,
  quantity: item.quantity,
});

const distinctProducts = (items: StockListItemDto[]) =>
  new Set(items.map((item) => item.product.id)).size;

/**
 * The inventory as a list, grouped by category. The search and the order go to the server; the
 * furniture and the categories are filtered here, so that the count of each piece of furniture in
 * the panel follows the chosen categories.
 */
export function ListView({
  filters = NO_FILTER,
  onSummary,
  onStockChanged,
  api = {},
}: ListViewProps) {
  const apiRef = useRef(api);
  const summaryRef = useRef(onSummary);
  const changedRef = useRef(onStockChanged);
  useEffect(() => {
    apiRef.current = api;
    summaryRef.current = onSummary;
    changedRef.current = onStockChanged;
  });

  /** Null until loaded: no summary is given before, so no filter is taken for a stale one. */
  const [locations, setLocations] = useState<LocationDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [items, setItems] = useState<StockListItemDto[] | null>(null);
  const [debounced, setDebounced] = useState(filters.q.trim());
  const [error, setError] = useState<string | null>(null);
  const [removal, setRemoval] = useState<RemovalPlan | null>(null);
  /** Batch mode: the ids of the lines ticked (null: not selecting). */
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [moving, setMoving] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchToast, setBatchToast] = useState<{
    message: string;
    undo: () => Promise<void>;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const { sort, locationId, categoryIds, expiry } = filters;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters.q.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    void Promise.all([
      (apiRef.current.fetchLocations ?? fetchLocations)(),
      (apiRef.current.fetchCategories ?? fetchCategories)(),
    ])
      .then(([loadedLocations, loadedCategories]) => {
        setLocations(loadedLocations);
        setCategories(loadedCategories);
      })
      .catch(() => setError('Impossible de charger les meubles et les catégories.'));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await (apiRef.current.fetchStock ?? fetchStock)({
        q: debounced || undefined,
        sort,
        expiry: expiry ?? undefined,
      });
      setItems(response.items);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Impossible de charger l’inventaire : vérifiez la connexion.',
      );
    }
  }, [debounced, sort, expiry]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Lines of the chosen categories, every piece of furniture: the counts of the panel. */
  const inCategories = useMemo(
    () =>
      (items ?? []).filter(
        (item) => categoryIds.length === 0 || categoryIds.includes(item.category.id),
      ),
    [items, categoryIds],
  );
  const shown = useMemo(
    () =>
      locationId === null
        ? inCategories
        : inCategories.filter((item) => item.location.id === locationId),
    [inCategories, locationId],
  );

  useEffect(() => {
    if (locations === null) return;
    summaryRef.current?.({
      total: distinctProducts(inCategories),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        count: distinctProducts(inCategories.filter((item) => item.location.id === location.id)),
      })),
    });
  }, [inCategories, locations]);

  /** Optimistic: the card changes at once and goes back to its old value if the server refuses. */
  const change = async (
    item: StockListItemDto,
    delta: 1 | -1,
    reason: RemovalReason = 'consumed',
  ) => {
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
        reason: delta < 0 ? reason : 'manual',
      });
      if (delta < 0) {
        // One toast at a time: a new removal replaces the batch toast.
        setBatchToast(null);
        setRemoval({
          productId: item.product.id,
          locationId: item.location.id,
          shelfId: item.shelf?.id ?? null,
          expiryDate: item.expiryDate,
          name: item.product.name,
          units: 1,
          reason,
        });
      }
      void load(); // counters and order follow the server
      changedRef.current?.();
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

  const chosen = useMemo(
    () => (items ?? []).filter((item) => selected?.has(item.id)),
    [items, selected],
  );

  const toggleSelected = (item: StockListItemDto) =>
    setSelected((current) => {
      const next = new Set(current ?? []);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });

  const lineKey = (item: StockListItemDto) => ({
    productId: item.product.id,
    locationId: item.location.id,
    shelfId: item.shelf?.id ?? null,
    expiryDate: item.expiryDate,
  });

  /** Takes every unit of the ticked lines out of the stock, then offers Annuler for 5 s. */
  const batchRemove = async (reason: 'consumed' | 'wasted') => {
    const lines = chosen;
    if (lines.length === 0 || batchBusy) return;
    setBatchBusy(true);
    setError(null);
    const done: StockListItemDto[] = [];
    try {
      for (const item of lines) {
        await (apiRef.current.adjust ?? adjustStock)({
          ...lineKey(item),
          delta: -item.quantity,
          reason,
        });
        done.push(item);
      }
    } catch (caught) {
      setError(
        `${done.length} sur ${lines.length} retirés. ${
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Modification impossible : vérifiez la connexion.'
        }`,
      );
    }
    setBatchBusy(false);
    if (done.length > 0) {
      setRemoval(null);
      setBatchToast({
        message: `${reason === 'consumed' ? 'Consommé' : 'Jeté'} : ${done.length} ${
          done.length > 1 ? 'produits' : 'produit'
        }`,
        undo: async () => {
          for (const item of done) {
            await (apiRef.current.adjust ?? adjustStock)({
              ...lineKey(item),
              delta: item.quantity,
              // Same reason as the removal: statistics net the undo out.
              reason,
            });
          }
        },
      });
    }
    setSelected(new Set());
    await load();
    changedRef.current?.();
  };

  const undoBatch = async () => {
    const current = batchToast;
    setBatchToast(null);
    try {
      await current?.undo();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Annulation impossible : vérifiez la connexion.',
      );
    }
    await load();
    changedRef.current?.();
  };

  const sections = useMemo(() => {
    const byCategory = new Map<number, StockListItemDto[]>();
    for (const item of shown) {
      byCategory.set(item.category.id, [...(byCategory.get(item.category.id) ?? []), item]);
    }
    return categories
      .filter((c) => byCategory.has(c.id))
      .map((c) => ({ category: c, items: byCategory.get(c.id) ?? [] }));
  }, [shown, categories]);

  const products = distinctProducts(shown);
  const units = shown.reduce((sum, item) => sum + item.quantity, 0);
  const filtering =
    debounced !== '' || categoryIds.length > 0 || locationId !== null || expiry !== null;

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorMessage message={error} onRetry={() => void load()} /> : null}

      {items === null ? (
        error ? null : (
          <ListSkeleton />
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p role="status" className="text-help">
              {products} {products > 1 ? 'articles' : 'article'} · {units}{' '}
              {units > 1 ? 'unités' : 'unité'}
            </p>
            {shown.length > 0 ? (
              <button
                type="button"
                aria-pressed={selected !== null}
                onClick={() => setSelected(selected === null ? new Set() : null)}
                className="tap-target text-indigo-mid -mr-2 px-2 font-semibold"
              >
                {selected === null ? 'Sélectionner' : 'Terminer la sélection'}
              </button>
            ) : null}
          </div>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              {!filtering ? <EmptyFurnitureIllustration /> : null}
              <Callout role="note" title={filtering ? 'Aucun résultat' : 'Rien ici pour l’instant'}>
                {filtering
                  ? 'Aucun produit ne correspond à cette recherche et à ces filtres.'
                  : 'Scannez un premier produit pour remplir l’inventaire.'}
              </Callout>
              {!filtering ? (
                <Link
                  href="/scanner"
                  className="tap-target bg-indigo text-white inline-flex items-center rounded-xl px-4 font-semibold transition-colors duration-150 hover:bg-indigo-mid"
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
                onRemove={(i, reason) => void change(i, -1, reason)}
                selection={selected ? { ids: selected, onToggle: toggleSelected } : undefined}
              />
            ))
          )}
        </>
      )}
      {selected ? (
        <BatchBar
          count={selected.size}
          busy={batchBusy}
          onMove={() => setMoving(true)}
          onConsumed={() => void batchRemove('consumed')}
          onWasted={() => void batchRemove('wasted')}
          onDone={() => setSelected(null)}
        />
      ) : null}

      {moving && chosen.length > 0 ? (
        <MoveDialog
          source={moveSource(chosen[0]!)}
          batch={chosen.map(moveSource)}
          locations={locations ?? []}
          move={apiRef.current.move}
          onClose={() => setMoving(false)}
          onMoved={(message) => {
            setMoving(false);
            setSelected(null);
            setAnnouncement(message);
            void load();
            changedRef.current?.();
          }}
        />
      ) : null}

      {batchToast ? (
        <UndoToast
          message={batchToast.message}
          onUndo={() => void undoBatch()}
          onExpire={() => setBatchToast(null)}
        />
      ) : null}

      {removal ? (
        <RemovalToast
          key={removalKey(removal)}
          plan={removal}
          reason={removal.reason}
          adjust={api.adjust}
          onChanged={() => {
            void load();
            changedRef.current?.();
          }}
          onError={setError}
          onClose={() => setRemoval(null)}
        />
      ) : null}
    </div>
  );
}
