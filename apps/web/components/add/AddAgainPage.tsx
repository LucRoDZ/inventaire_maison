'use client';

import type { RecentProductDto } from '@inventaire/shared';
import { RECENT_PRODUCTS_PAGE } from '@inventaire/shared';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addNotice } from '../../lib/add-notice';
import { abandonOp, queueOp, syncNow } from '../../lib/offline/runtime';
import { fetchRecentProducts } from '../../lib/shopping-api';
import { ErrorMessage } from '../ui/ErrorMessage';
import { FullPageList } from '../ui/FullPageList';
import { SelectableRow } from '../ui/SelectableRow';

const MAX_LIMIT = 200;
const DAYS = 365;
const MAX_PAST_DAYS = 30;

type Sort = 'recent' | 'alpha' | 'count';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Récents' },
  { value: 'alpha', label: 'Alphabétique' },
  { value: 'count', label: 'Plus consommés' },
];

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as `YYYY-MM-DD`. */
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const detailOf = (product: RecentProductDto) =>
  [product.locationName, product.sizeLabel].filter((part): part is string => !!part).join(' · ');

const sorted = (items: RecentProductDto[], sort: Sort) => {
  const copy = [...items];
  if (sort === 'alpha') return copy.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (sort === 'count') return copy.sort((a, b) => b.count - a.count);
  return copy.sort((a, b) => b.lastConsumedAt.localeCompare(a.lastConsumedAt));
};

/** The « Ajouter à nouveau » page: multi-select of recent products, added through the offline queue. */
export function AddAgainPage() {
  const router = useRouter();
  const [limit, setLimit] = useState(RECENT_PRODUCTS_PAGE);
  const [items, setItems] = useState<RecentProductDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const today = useMemo(() => new Date(), []);
  const max = localDate(today);
  const min = useMemo(() => {
    const past = new Date(today);
    past.setDate(past.getDate() - MAX_PAST_DAYS);
    return localDate(past);
  }, [today]);
  const [date, setDate] = useState(max);

  const load = useCallback(() => {
    setFailed(false);
    let cancelled = false;
    fetchRecentProducts({ limit, days: DAYS })
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);
  useEffect(() => load(), [load]);

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace('/inventaire');
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = items ?? [];
    return sorted(
      needle ? list.filter((product) => product.name.toLowerCase().includes(needle)) : list,
      sort,
    );
  }, [items, query, sort]);

  const toggle = (id: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const count = selected.size;
  const canMore = items !== null && items.length >= limit && limit < MAX_LIMIT;

  const submit = async () => {
    if (count === 0 || saving || !date) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const [year, month, day] = date.split('-').map(Number);
      const createdAt = new Date(year!, month! - 1, day!, 12, 0, 0).toISOString();
      const seqs: number[] = [];
      for (const productId of selected) {
        const queued = await queueOp({ kind: 'add', productId, quantity: 1, createdAt });
        seqs.push(queued.seq);
      }
      addNotice.show({
        message: `${count} produit${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''}`,
        undo: async () => {
          await Promise.all(seqs.map((seq) => abandonOp(seq)));
        },
        commit: () => void syncNow().catch(() => undefined),
      });
      router.replace('/inventaire');
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-semibold">Acheté le</span>
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(event) => setDate(event.target.value)}
          className="border-line rounded-card bg-surface-raised min-h-11 border px-3"
        />
      </label>
      {saveFailed ? (
        <p role="alert" className="text-alert">
          Ajout impossible, réessayez
        </p>
      ) : null}
      <button
        type="button"
        disabled={count === 0 || saving || !date}
        onClick={() => void submit()}
        className="tap-target bg-indigo rounded-card min-h-12 px-5 font-semibold text-white disabled:opacity-50"
      >
        {`Ajouter ${count} produit${count > 1 ? 's' : ''}`}
      </button>
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          size={18}
          aria-hidden="true"
          className="text-grey pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Rechercher des produits précédents"
          placeholder="Rechercher des produits précédents"
          className="border-line rounded-card bg-surface-raised min-h-11 w-full border pr-3 pl-10"
        />
      </div>
      <select
        value={sort}
        onChange={(event) => setSort(event.target.value as Sort)}
        aria-label="Trier"
        className="border-line rounded-card bg-surface-raised min-h-11 shrink-0 border px-2"
      >
        {SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  const empty = failed ? (
    <ErrorMessage message="Liste indisponible pour le moment." onRetry={load} />
  ) : (
    <p className="text-grey px-2 py-4">
      {items && items.length > 0
        ? 'Aucun produit ne correspond'
        : 'Aucun produit consommé pour le moment'}
    </p>
  );

  return (
    <FullPageList
      title="Ajouter à nouveau"
      onBack={back}
      toolbar={toolbar}
      footer={footer}
      loading={items === null && !failed}
      isEmpty={failed || visible.length === 0}
      emptyState={empty}
      zoneLabel="Produits précédents"
    >
      {visible.map((product) => (
        <SelectableRow
          key={product.productId}
          name={product.name}
          imageUrl={product.imageUrl}
          detail={detailOf(product) || undefined}
          meta={`${product.inStock} en stock`}
          checked={selected.has(product.productId)}
          onChange={(checked) => toggle(product.productId, checked)}
        />
      ))}
      {canMore ? (
        <button
          type="button"
          onClick={() => setLimit((current) => Math.min(current + 50, MAX_LIMIT))}
          className="tap-target text-indigo min-h-11 px-3 text-left font-semibold underline underline-offset-4"
        >
          Voir plus
        </button>
      ) : null}
    </FullPageList>
  );
}
