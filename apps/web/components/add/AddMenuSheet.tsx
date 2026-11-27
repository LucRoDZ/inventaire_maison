'use client';

import type { CategoryDto, LocationDto, ProductDto, RecentProductDto } from '@inventaire/shared';
import {
  ChevronDown,
  ChevronUp,
  History,
  PencilLine,
  ScanBarcode,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { abandonOp, queueOp, syncNow } from '../../lib/offline/runtime';
import { getProduct } from '../../lib/products-api';
import { fetchRecentProducts } from '../../lib/shopping-api';
import { adjustStock, fetchCategories, fetchLocations } from '../../lib/stock-api';
import { ProductForm } from '../product/ProductForm';
import { BottomSheet } from '../ui/BottomSheet';
import { ErrorMessage } from '../ui/ErrorMessage';
import { AddSheet, type AddedInfo } from './AddSheet';
import { CatalogSearch } from './CatalogSearch';

/** Recent products shown before « Voir plus ». */
export const RECENT_VISIBLE = 6;

export interface AddNotice {
  message: string;
  undo: () => Promise<void>;
}

interface AddMenuSheetProps {
  onClose: () => void;
  /** Something was added: the host shows the Annuler toast (the sheet closes). */
  onNotify: (notice: AddNotice) => void;
}

type Step =
  | { name: 'menu' }
  | { name: 'search' }
  | { name: 'create'; productName: string }
  | { name: 'add'; product: ProductDto };

type Recent =
  | { state: 'closed' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; items: RecentProductDto[]; all: boolean };

interface RowProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
  expanded?: boolean;
}

function Row({ icon: Icon, label, hint, onClick, expanded }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="tap-target text-indigo hover:bg-lavender flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
    >
      <span className="bg-lavender flex size-11 shrink-0 items-center justify-center rounded-full">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="text-help text-grey block">{hint}</span>
      </span>
      {expanded === undefined ? null : expanded ? (
        <ChevronUp size={20} aria-hidden="true" />
      ) : (
        <ChevronDown size={20} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The « Ajouter » sheet: add again a product used lately (+1 through the offline queue), scan, or
 * add by name. Manual add reuses the catalogue search and the add sheet of the scanner.
 */
export function AddMenuSheet({ onClose, onNotify }: AddMenuSheetProps) {
  const titleId = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'menu' });
  const [recent, setRecent] = useState<Recent>({ state: 'closed' });
  const [refs, setRefs] = useState<{ categories: CategoryDto[]; locations: LocationDto[] } | null>(
    null,
  );
  const [refsFailed, setRefsFailed] = useState(false);
  // One « Ajouter à nouveau » at a time: a double tap never adds two units.
  const adding = useRef(false);
  const [recentError, setRecentError] = useState(false);

  useEffect(() => {
    if (step.name !== 'create' && step.name !== 'add') return;
    if (refs || refsFailed) return;
    let cancelled = false;
    Promise.all([fetchLocations(), fetchCategories()])
      .then(([locations, categories]) => {
        if (!cancelled) setRefs({ locations, categories });
      })
      .catch(() => {
        if (!cancelled) setRefsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [step.name, refs, refsFailed]);

  const loadRecent = () => {
    setRecent({ state: 'loading' });
    fetchRecentProducts()
      .then((items) => setRecent({ state: 'ready', items, all: false }))
      .catch(() => setRecent({ state: 'error' }));
  };
  const toggleRecent = () =>
    recent.state === 'closed' ? loadRecent() : setRecent({ state: 'closed' });
  const toggleRecentAgain = loadRecent;

  /**
   * +1 at the usual location. Online: a direct add, undone by a `correction` on the very line (as
   * the scanner does, so statistics never count the undo as consumed). Offline or without a usual
   * location: the offline queue (the server then picks the usual location, or reports a conflict);
   * undo drops the queued operation while it waits.
   */
  const addAgain = async (product: RecentProductDto) => {
    if (adding.current) return;
    adding.current = true;
    try {
      await addAgainOnce(product);
    } finally {
      adding.current = false;
    }
  };

  const addAgainOnce = async (product: RecentProductDto) => {
    setRecentError(false);
    const message = `${product.name} : +1`;
    const online = typeof navigator === 'undefined' || navigator.onLine;
    const detail = online ? await getProduct(product.productId).catch(() => null) : null;
    const locationId = detail?.defaultLocationId ?? null;
    if (online && locationId !== null) {
      // A failed request is not queued: its answer may be lost after the server applied it.
      const direct = await adjustStock({
        productId: product.productId,
        locationId,
        delta: 1,
        reason: 'manual',
      }).catch(() => null);
      if (!direct?.item) {
        setRecentError(true);
        return;
      }
      const line = direct.item;
      onNotify({
        message,
        undo: async () => {
          await adjustStock({
            productId: product.productId,
            locationId: line.locationId,
            shelfId: line.shelfId,
            expiryDate: line.expiryDate,
            delta: -1,
            reason: 'correction',
          });
        },
      });
      onClose();
      return;
    }
    const queued = await queueOp({ kind: 'add', productId: product.productId, quantity: 1 });
    void syncNow().catch(() => undefined);
    onNotify({ message, undo: () => abandonOp(queued.seq) });
    onClose();
  };

  const added = (info: AddedInfo) => {
    onNotify({ message: info.message, undo: info.undo });
    onClose();
  };

  if (step.name === 'search') {
    return (
      <CatalogSearch
        onPick={(product) => setStep({ name: 'add', product })}
        onCreate={(productName) => setStep({ name: 'create', productName })}
        onClose={onClose}
      />
    );
  }
  if (step.name === 'create' && refs) {
    return (
      <ProductForm
        barcode={null}
        reason="manual"
        initialName={step.productName}
        categories={refs.categories}
        locations={refs.locations}
        onCreated={(product) => setStep({ name: 'add', product })}
        onCancel={onClose}
      />
    );
  }
  if (step.name === 'add' && refs) {
    return (
      <AddSheet
        product={step.product}
        categories={refs.categories}
        locations={refs.locations}
        reason="manual"
        onAdded={added}
        onClose={onClose}
      />
    );
  }
  if (step.name !== 'menu') {
    // Places and categories still loading, or failed: the sheet stays, never an empty screen.
    return (
      <BottomSheet labelledBy={titleId} onClose={onClose}>
        <h2 id={titleId} className="text-subtitle">
          Ajouter
        </h2>
        {refsFailed ? (
          <ErrorMessage
            message="Impossible de charger les lieux"
            onRetry={() => setRefsFailed(false)}
          />
        ) : (
          <p role="status">Chargement…</p>
        )}
      </BottomSheet>
    );
  }

  const visible =
    recent.state === 'ready'
      ? recent.all
        ? recent.items
        : recent.items.slice(0, RECENT_VISIBLE)
      : [];

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-subtitle">
        Ajouter
      </h2>
      <div className="flex flex-col gap-1">
        <Row
          icon={History}
          label="Ajouter à nouveau"
          hint="Un produit déjà consommé"
          expanded={recent.state !== 'closed'}
          onClick={toggleRecent}
        />
        {recent.state === 'loading' ? <p className="text-grey px-2">Chargement…</p> : null}
        {recent.state === 'error' ? (
          <ErrorMessage message="Liste indisponible pour le moment." onRetry={toggleRecentAgain} />
        ) : null}
        {recentError ? (
          <p role="alert" className="text-alert px-2">
            Ajout impossible, réessayez
          </p>
        ) : null}
        {recent.state === 'ready' && recent.items.length === 0 ? (
          <p className="text-grey px-2">Aucun produit consommé ces 30 derniers jours</p>
        ) : null}
        {visible.length > 0 ? (
          <ul className="flex flex-col pl-14">
            {visible.map((product) => (
              <li key={product.productId}>
                <button
                  type="button"
                  onClick={() => void addAgain(product)}
                  className="tap-target hover:bg-lavender w-full rounded-xl px-2 text-left"
                >
                  {product.name}
                </button>
              </li>
            ))}
            {recent.state === 'ready' && !recent.all && recent.items.length > RECENT_VISIBLE ? (
              <li>
                <button
                  type="button"
                  onClick={() => setRecent({ ...recent, all: true })}
                  className="tap-target text-indigo w-full rounded-xl px-2 text-left font-semibold underline underline-offset-4"
                >
                  Voir plus
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
        <Row
          icon={ScanBarcode}
          label="Scanner"
          hint="Un code-barres avec la caméra"
          onClick={() => {
            onClose();
            router.push('/scanner');
          }}
        />
        <Row
          icon={PencilLine}
          label="Ajouter manuellement"
          hint="Chercher un produit par son nom"
          onClick={() => setStep({ name: 'search' })}
        />
      </div>
    </BottomSheet>
  );
}
