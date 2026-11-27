'use client';

import type {
  CategoryDto,
  LocationDto,
  ProductDetailDto,
  ProductDto,
  RecentProductDto,
  ShoppingItemCreateInput,
  ShoppingItemDto,
  ShoppingListResponse,
  ShoppingStoreResponse,
  StockAdjustInput,
  StockAdjustResponse,
} from '@inventaire/shared';
import {
  Check,
  ChevronRight,
  History,
  MoreHorizontal,
  Minus,
  Plus,
  Share2,
  Trash2,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../lib/api';
import { getProduct } from '../../lib/products-api';
import {
  addShoppingItem,
  clearCheckedShopping,
  deleteShoppingItem,
  fetchRecentProducts,
  fetchShopping,
  patchShoppingItem,
  shoppingQuantityText,
  storeCheckedShopping,
} from '../../lib/shopping-api';
import { adjustStock, fetchCategories, fetchLocations } from '../../lib/stock-api';
import { AddSheet } from '../add/AddSheet';
import { UndoToast } from '../add/UndoToast';
import { ProductForm } from '../product/ProductForm';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { EmptyShoppingIllustration } from '../ui/Illustrations';
import { FullPageList } from '../ui/FullPageList';
import { SwipeRow } from '../ui/SwipeRow';
import { shareText, shoppingShareText } from '../../lib/share';
import { QuickEntry } from './QuickEntry';

export interface ShoppingApi {
  fetchShopping: () => Promise<ShoppingListResponse>;
  add: (input: ShoppingItemCreateInput) => Promise<unknown>;
  patch: (id: number, patch: { checked?: boolean; quantity?: number }) => Promise<unknown>;
  remove: (id: number) => Promise<void>;
  clearChecked: () => Promise<unknown>;
  storeChecked: () => Promise<ShoppingStoreResponse>;
  fetchRecent: () => Promise<RecentProductDto[]>;
  adjust: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  getProduct: (id: number) => Promise<ProductDetailDto>;
  fetchCategories: () => Promise<CategoryDto[]>;
  fetchLocations: () => Promise<LocationDto[]>;
}

const DEFAULT_API: ShoppingApi = {
  fetchShopping,
  add: addShoppingItem,
  patch: patchShoppingItem,
  remove: deleteShoppingItem,
  clearChecked: clearCheckedShopping,
  storeChecked: storeCheckedShopping,
  fetchRecent: fetchRecentProducts,
  adjust: adjustStock,
  getProduct,
  fetchCategories,
  fetchLocations,
};

const messageOf = (caught: unknown, fallback: string) =>
  caught instanceof ApiError && caught.status !== 0
    ? caught.message
    : `${fallback} : vérifiez la connexion.`;

const itemName = (item: ShoppingItemDto) => item.product?.name ?? item.label ?? 'Article';

type Pending =
  | { name: 'none' }
  | { name: 'loading'; item: ShoppingItemDto }
  | { name: 'create'; item: ShoppingItemDto }
  | { name: 'add'; item: ShoppingItemDto; product: ProductDto };

type Toast = { message: string; undo: () => Promise<void> } | null;

/**
 * The shopping list: lines with a checkbox and a quantity, the quick entry in the header, the
 * recently consumed products, and « Ranger les articles cochés » (stock + 5 s Annuler).
 */
export function ShoppingList({ api: seam = {} }: { api?: Partial<ShoppingApi> }) {
  const apiRef = useRef<ShoppingApi>({ ...DEFAULT_API, ...seam });
  useEffect(() => {
    apiRef.current = { ...DEFAULT_API, ...seam };
  });

  const [items, setItems] = useState<ShoppingItemDto[] | null>(null);
  const [recent, setRecent] = useState<RecentProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [needsForm, setNeedsForm] = useState<ShoppingItemDto[]>([]);
  const [pending, setPending] = useState<Pending>({ name: 'none' });
  const [referential, setReferential] = useState<{
    categories: CategoryDto[];
    locations: LocationDto[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [shareNote, setShareNote] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await apiRef.current.fetchShopping()).items);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught, 'Impossible de charger la liste'));
    }
    apiRef.current
      .fetchRecent()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (input: ShoppingItemCreateInput) => {
      // A free line needs nothing from the server to be drawn: it appears at once, and goes away
      // again (with the message) if the server refuses. A catalogue product may be merged into an
      // existing line, so it waits for the answer.
      const label = input.productId ? null : (input.label ?? null);
      const temporaryId = -Date.now();
      if (label) {
        setItems((current) => [
          ...(current ?? []).filter((line) => !line.checked),
          {
            id: temporaryId,
            product: null,
            label,
            quantity: input.quantity ?? 1,
            amount: input.amount ?? null,
            unit: input.unit ?? null,
            checked: false,
            origin: 'manual',
            createdAt: new Date().toISOString(),
          },
          ...(current ?? []).filter((line) => line.checked),
        ]);
      }
      try {
        await apiRef.current.add(input);
      } catch (caught) {
        setItems((current) => (current ?? []).filter((line) => line.id !== temporaryId));
        throw new Error(messageOf(caught, 'Ajout impossible'));
      }
      await load();
    },
    [load],
  );

  /** Runs a change of the list; an error is said once, the list is loaded again either way. */
  const act = async (run: () => Promise<unknown>, fallback: string) => {
    setError(null);
    let failure: string | null = null;
    try {
      await run();
    } catch (caught) {
      failure = messageOf(caught, fallback);
    }
    // The list comes back as the server has it (the optimistic change, if refused, is undone);
    // the message is said after, so that the reload does not wipe it.
    await load();
    if (failure) setError(failure);
  };

  const toggle = (item: ShoppingItemDto) => {
    setItems((current) =>
      (current ?? []).map((line) =>
        line.id === item.id ? { ...line, checked: !line.checked } : line,
      ),
    );
    void act(
      () => apiRef.current.patch(item.id, { checked: !item.checked }),
      'Modification impossible',
    );
  };

  const setQuantity = (item: ShoppingItemDto, quantity: number) => {
    setItems((current) =>
      (current ?? []).map((line) => (line.id === item.id ? { ...line, quantity } : line)),
    );
    return act(() => apiRef.current.patch(item.id, { quantity }), 'Modification impossible');
  };

  /** Swipe right: checks the line (or unchecks it when it already is). */
  const check = (item: ShoppingItemDto) => toggle(item);

  /** Removes a line, with the 5 s Annuler that puts it back as it was. */
  const removeLine = async (item: ShoppingItemDto) => {
    setError(null);
    setItems((current) => (current ?? []).filter((line) => line.id !== item.id));
    try {
      await apiRef.current.remove(item.id);
    } catch (caught) {
      await load();
      setError(messageOf(caught, 'Suppression impossible'));
      return;
    }
    setToast({
      message: `Supprimé : ${itemName(item)}`,
      undo: async () => {
        await apiRef.current.add({
          ...(item.product ? { productId: item.product.id } : { label: item.label }),
          quantity: item.quantity,
          amount: item.amount,
          unit: item.unit,
        });
      },
    });
    await load();
  };

  const share = async () => {
    const text = shoppingShareText(items ?? []);
    const outcome = await shareText('Liste de courses', text);
    if (outcome === 'shared') setShareNote('Liste partagée.');
    else if (outcome === 'copied') setShareNote('Liste copiée dans le presse-papiers.');
    else if (outcome === 'failed') setError('Partage impossible : copiez la liste à la main.');
  };

  const checked = (items ?? []).filter((item) => item.checked);

  const clear = async () => {
    setBusy(true);
    await act(async () => {
      const done = (await apiRef.current.clearChecked()) as { removed?: number } | undefined;
      const count = done?.removed ?? checked.length;
      setAnnouncement(`${count} ${count > 1 ? 'lignes retirées' : 'ligne retirée'} de la liste.`);
    }, 'Impossible de vider');
    setBusy(false);
  };

  const store = async () => {
    setBusy(true);
    setError(null);
    let result: ShoppingStoreResponse;
    try {
      result = await apiRef.current.storeChecked();
    } catch (caught) {
      setError(messageOf(caught, 'Impossible de ranger'));
      setBusy(false);
      return;
    }
    setBusy(false);
    setNeedsForm(result.needsForm);
    if (result.stored.length > 0) {
      const names = result.stored.length;
      setToast({
        message: `${names} ${names > 1 ? 'articles rangés' : 'article rangé'} dans le stock`,
        undo: async () => {
          // Opposite delta on the very line, then the lines come back on the list.
          for (const line of result.stored) {
            await apiRef.current.adjust({
              productId: line.productId,
              locationId: line.locationId,
              delta: -line.quantity,
              reason: 'correction',
            });
            await apiRef.current.add({ productId: line.productId, quantity: line.quantity });
          }
        },
      });
    }
    await load();
  };

  const undo = async () => {
    const current = toast;
    setToast(null);
    if (!current) return;
    try {
      await current.undo();
    } catch (caught) {
      setError(messageOf(caught, 'Annulation impossible'));
    }
    await load();
  };

  const complete = async (item: ShoppingItemDto) => {
    setPending({ name: 'loading', item });
    try {
      const [categories, locations] = referential
        ? [referential.categories, referential.locations]
        : await Promise.all([apiRef.current.fetchCategories(), apiRef.current.fetchLocations()]);
      setReferential({ categories, locations });
      if (item.product) {
        const product = await apiRef.current.getProduct(item.product.id);
        setPending({ name: 'add', item, product });
      } else {
        setPending({ name: 'create', item });
      }
    } catch (caught) {
      setPending({ name: 'none' });
      setError(messageOf(caught, 'Impossible d’ouvrir la fiche'));
    }
  };

  const stored = async (item: ShoppingItemDto) => {
    setPending({ name: 'none' });
    setNeedsForm((current) => current.filter((line) => line.id !== item.id));
    try {
      await apiRef.current.remove(item.id);
    } catch {
      // Already gone from the list: nothing to do.
    }
    await load();
  };

  const open = (items ?? []).filter((item) => !item.checked);

  const header = (
    <>
      <QuickEntry onAdd={add} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {error ? <ErrorMessage message={error} onRetry={() => void load()} /> : null}
      {recent.length > 0 ? (
        <Link
          href="/recemment-consommes"
          className="tap-target border-line text-indigo hover:bg-lavender bg-surface-raised rounded-card flex items-center gap-3 border px-4 font-semibold transition-colors duration-150"
        >
          <History size={18} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Récemment consommés</span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
        </Link>
      ) : null}
    </>
  );

  const footer =
    items !== null && items.length > 0 ? (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {checked.length > 0 ? (
            <Button
              variant="primary"
              className="min-w-0 flex-1"
              disabled={busy}
              onClick={() => void store()}
            >
              Ranger les articles cochés ({checked.length})
            </Button>
          ) : (
            <span className="flex-1" />
          )}
          <ActionsMenu
            canClear={checked.length > 0 && !busy}
            onClear={() => void clear()}
            onShare={() => void share()}
          />
        </div>
        <p role="status" className="text-help">
          {shareNote}
        </p>
      </div>
    ) : null;

  return (
    <>
      <FullPageList
        title="Courses"
        zoneLabel="Liste de courses"
        memoryKey="courses"
        bare
        header={header}
        footer={footer}
        loading={items === null && !error}
      >
        {items === null ? null : items.length === 0 ? (
          <section className="border-line rounded-card shadow-card bg-surface-raised flex flex-col items-start gap-2 border p-4">
            <EmptyShoppingIllustration />
            <h2 className="text-card-title">La liste est vide</h2>
            <p className="text-body">
              Écrivez ce qu’il faut acheter dans le champ ci-dessus, ou touchez un produit récemment
              consommé.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Articles à acheter">
            {[...open, ...checked].map((item) => (
              <ShoppingLine
                key={item.id}
                item={item}
                onToggle={() => toggle(item)}
                onQuantity={(quantity) => void setQuantity(item, quantity)}
                onCheck={() => check(item)}
                onRemove={() => void removeLine(item)}
              />
            ))}
          </ul>
        )}

        {needsForm.length > 0 ? (
          <section aria-labelledby="a-completer" className="flex flex-col gap-2">
            <h2 id="a-completer" className="text-card-title">
              À ranger à la main
            </h2>
            <p className="text-small">
              Ces articles n’ont pas de lieu habituel : choisissez où les ranger.
            </p>
            <ul className="flex flex-col gap-2">
              {needsForm.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={pending.name === 'loading'}
                    onClick={() => void complete(item)}
                  >
                    <span className="truncate">{itemName(item)}</span>
                    <span>Ranger</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </FullPageList>

      {pending.name === 'create' && referential ? (
        <ProductForm
          barcode={null}
          reason="manual"
          initialName={itemName(pending.item)}
          categories={referential.categories}
          locations={referential.locations}
          onCreated={(product) => setPending({ name: 'add', item: pending.item, product })}
          onCancel={() => setPending({ name: 'none' })}
        />
      ) : null}
      {pending.name === 'add' && referential ? (
        <AddSheet
          product={pending.product}
          categories={referential.categories}
          locations={referential.locations}
          reason="manual"
          onAdded={() => void stored(pending.item)}
          onClose={() => setPending({ name: 'none' })}
        />
      ) : null}

      {toast ? (
        <UndoToast
          message={toast.message}
          onUndo={() => void undo()}
          onExpire={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

interface ActionsMenuProps {
  canClear: boolean;
  onClear: () => void;
  onShare: () => void;
}

/** The ⋯ button of the footer and its menu (Échap closes it, the focus goes back to the button). */
function ActionsMenu({ canClear, onClear, onShare }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(
        root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };
  const itemClass =
    'tap-target hover:bg-lavender flex w-full items-center gap-2 rounded-xl px-3 text-left disabled:opacity-50';

  return (
    <div ref={root} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="tap-target border-line text-indigo bg-surface-raised inline-flex size-11 items-center justify-center rounded-full border"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Plus d'actions"
          className="border-line bg-surface-raised shadow-raised absolute right-0 bottom-full z-30 mb-2 flex w-64 flex-col rounded-xl border p-1"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canClear}
            onClick={() => {
              close();
              onClear();
            }}
            className={itemClass}
          >
            Vider les lignes cochées
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onShare();
            }}
            className={itemClass}
          >
            <Share2 size={18} aria-hidden="true" />
            Partager la liste
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ShoppingLineProps {
  item: ShoppingItemDto;
  onToggle: () => void;
  onCheck: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}

function ShoppingLine({ item, onToggle, onCheck, onQuantity, onRemove }: ShoppingLineProps) {
  const name = itemName(item);
  const round =
    'tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-lavender-line disabled:opacity-50';
  return (
    <li>
      <SwipeRow
        right={{
          label: item.checked ? 'Décocher' : 'Cocher',
          icon: item.checked ? Undo2 : Check,
          tone: 'consumed',
          run: onCheck,
        }}
        left={{ label: 'Supprimer', icon: Trash2, tone: 'wasted', run: onRemove }}
      >
        <div className="border-line rounded-card shadow-card flex items-center gap-2 border bg-white py-1 pr-2 pl-1">
          <label className="tap-target flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={onToggle}
              className="accent-indigo h-5 w-5 shrink-0"
            />
            <span className="min-w-0">
              <span
                className={`block truncate font-semibold ${item.checked ? 'text-grey line-through' : 'text-ink'}`}
              >
                {name}
              </span>
              <span className="text-help block tabular-nums">
                {shoppingQuantityText(item)}
                {item.product === null ? ' · ligne libre' : ''}
              </span>
            </span>
          </label>
          <div role="group" aria-label={`Quantité de ${name}`} className="flex items-center">
            <button
              type="button"
              aria-label={`Diminuer la quantité de ${name}`}
              disabled={item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
              className={round}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Augmenter la quantité de ${name}`}
              onClick={() => onQuantity(item.quantity + 1)}
              className={round}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Supprimer ${name}`}
              onClick={onRemove}
              className="tap-target text-indigo-mid inline-flex items-center justify-center rounded-full"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </SwipeRow>
    </li>
  );
}
