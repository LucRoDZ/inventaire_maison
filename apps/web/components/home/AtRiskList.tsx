'use client';

import type {
  ExpiryFilter,
  HomeTileDto,
  LocationDto,
  RemovalReason,
  StockAdjustInput,
  StockAdjustResponse,
  StockListItemDto,
  StockListResponse,
} from '@inventaire/shared';
import { Check, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import type { HomeFilters } from '../../lib/home-filters';
import { focusHref } from '../../lib/shelf-focus';
import { adjustStock, fetchLocations, fetchStock, type StockFilters } from '../../lib/stock-api';
import { inviteAfterRemoval } from '../../lib/zero-stock';
import { RemovalToast, type RemovalPlan, removalKey } from '../add/RemovalToast';
import { StockCard } from '../list/StockCard';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { ErrorMessage } from '../ui/ErrorMessage';
import { ListSkeleton } from '../ui/Skeleton';
import { SwipeRow } from '../ui/SwipeRow';
import { ProductSheet } from './ProductSheet';

const SEARCH_DELAY_MS = 300;

const EMPTY_TEXT: Record<ExpiryFilter, string> = {
  today: 'Rien à consommer aujourd’hui',
  soon: 'Rien ne périme bientôt',
  expired: 'Rien de périmé',
};

interface AtRiskListProps {
  /** The filters of the URL; `expiry` is set (otherwise the furniture cards are shown). */
  filters: HomeFilters;
  /** Brings the furniture cards back (clears the expiry filter). */
  onClear: () => void;
  /** Called once the stock changed, for the counters. */
  onStockChanged?: () => void;
  /** Test seams. */
  api?: {
    fetchStock?: (filters: StockFilters) => Promise<StockListResponse>;
    fetchLocations?: () => Promise<LocationDto[]>;
    adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  };
}

const toTile = (item: StockListItemDto): HomeTileDto => ({
  stockItemId: item.id,
  productId: item.product.id,
  name: item.product.name,
  brand: item.product.brand,
  imageUrl: item.product.imageUrl,
  category: item.category,
  quantity: item.quantity,
  expiryDate: item.expiryDate,
  expiry: item.expiry,
});

/** Most urgent first: the oldest date first (a sort, no date is computed here). */
const byUrgency = (a: StockListItemDto, b: StockListItemDto): number =>
  (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') || a.id - b.id;

/**
 * Maison with an expiry filter on: the products at risk as a list (same lines, same endpoint
 * as the Liste view), instead of the furniture cards. Each line says where it is.
 */
export function AtRiskList({ filters, onClear, onStockChanged, api = {} }: AtRiskListProps) {
  const apiRef = useRef(api);
  const changedRef = useRef(onStockChanged);
  useEffect(() => {
    apiRef.current = api;
    changedRef.current = onStockChanged;
  });
  const expiry = filters.expiry!;
  const [items, setItems] = useState<StockListItemDto[] | null>(null);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removal, setRemoval] = useState<RemovalPlan | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [debounced, setDebounced] = useState(filters.q.trim());
  const { categoryIds } = filters;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters.q.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    void (apiRef.current.fetchLocations ?? fetchLocations)()
      .then(setLocations)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await (apiRef.current.fetchStock ?? fetchStock)({
        q: debounced || undefined,
        sort: 'expiry',
        expiry,
      });
      setItems(response.items);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Impossible de charger les produits : vérifiez la connexion.',
      );
    }
  }, [debounced, expiry]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const shown = useMemo(
    () =>
      (items ?? [])
        .filter((item) => categoryIds.length === 0 || categoryIds.includes(item.category.id))
        .sort(byUrgency),
    [items, categoryIds],
  );

  /** Optimistic, like the Liste view: the line changes at once; the server list then decides. */
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
      const done = await (apiRef.current.adjust ?? adjustStock)({
        productId: item.product.id,
        locationId: item.location.id,
        shelfId: item.shelf?.id ?? null,
        expiryDate: item.expiryDate,
        delta,
        reason: delta < 0 ? reason : 'manual',
      });
      if (delta < 0) {
        inviteAfterRemoval(done, item.product);
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
      void load();
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

  const current = selected === null ? undefined : shown.find((item) => item.id === selected);

  return (
    <div className="flex flex-col gap-3" data-testid="at-risk-list">
      {error ? <ErrorMessage message={error} onRetry={() => void load()} /> : null}
      {items === null ? (
        error ? null : (
          <ListSkeleton />
        )
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <Callout
            role="note"
            title={debounced || categoryIds.length > 0 ? 'Aucun résultat' : EMPTY_TEXT[expiry]}
          >
            {debounced || categoryIds.length > 0
              ? 'Aucun produit ne correspond à cette recherche.'
              : 'Rien à signaler pour l’instant.'}
          </Callout>
          <Button variant="primary" onClick={onClear}>
            Voir tous les meubles
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => (
            <li key={item.id}>
              <SwipeRow
                right={{
                  label: 'Consommé',
                  icon: Check,
                  tone: 'consumed',
                  run: () => void change(item, -1, 'consumed'),
                }}
                left={{
                  label: 'Jeté',
                  icon: Trash2,
                  tone: 'wasted',
                  run: () => void change(item, -1, 'wasted'),
                }}
              >
                <StockCard
                  item={item}
                  placeLine
                  onOpen={(line) => setSelected(line.id)}
                  onChange={(line, delta) => void change(line, delta)}
                />
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
      {current ? (
        <ProductSheet
          key={current.id}
          tile={toTile(current)}
          place={{
            locationId: current.location.id,
            locationName: current.location.name,
            shelfId: current.shelf?.id ?? null,
            shelfName: current.shelf?.name ?? null,
          }}
          locations={locations}
          viewHref={
            current.shelf
              ? focusHref(current.location.id, current.shelf.id)
              : `/inventaire/${current.location.id}`
          }
          onChanged={() => {
            void load();
            changedRef.current?.();
          }}
          onClose={() => setSelected(null)}
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
