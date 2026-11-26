'use client';

import type {
  CategoryDto,
  LocationDto,
  ProductDto,
  ScanHints,
  ScanResponse,
  ScanUnknownReason,
} from '@inventaire/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { handleOfflineScan, OFFLINE_SCAN_MESSAGE } from '../../lib/offline';
import { useOnline } from '../../lib/online';
import { fetchScan, OFFLINE_MESSAGE, resolveScan } from '../../lib/scan-flow';
import { attachBarcode } from '../../lib/products-api';
import { adjustStock, fetchCategories, fetchLocations } from '../../lib/stock-api';
import type { ScanResult } from '../../lib/scanner/types';
import { AddSheet, type AddedInfo } from '../add/AddSheet';
import { CatalogSearch } from '../add/CatalogSearch';
import { UndoToast } from '../add/UndoToast';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { ProductForm } from '../product/ProductForm';
import { ProductPicker } from '../product/ProductPicker';
import { InAppBrowserNotice } from './InAppBrowserNotice';
import { ManualCodeInput } from './ManualCodeInput';
import { PhotoCodeButton } from './PhotoCodeButton';
import { RemoveFlow, type RemoveRequest } from './RemoveFlow';
import { ScanSheet } from './ScanSheet';
import { ScannerView, type ScanMode, type ScannerControls } from './ScannerView';

export interface UnknownContext {
  barcode: string;
  reason: ScanUnknownReason;
  hints: ScanHints | null;
  /** The product now exists: carry on with the add sheet. `notice` is shown if set. */
  onCreated: (product: ProductDto, notice?: string) => void;
  onCancel: () => void;
}

interface ScanFlowProps {
  /** Furniture and shelf the scanner was opened from, when it was. */
  origin?: { locationId: number; shelfId?: number | null } | null;
  /** « Fermer le scanner ». */
  onClose?: () => void;
  /** Free slot at the top of the screen (the offline « À synchroniser (n) » badge). */
  statusSlot?: ReactNode;
  /** Replaces the creation form for a code Open Food Facts could not describe (tests). */
  renderUnknown?: (context: UnknownContext) => ReactNode;
  /** Test seams. */
  api?: {
    fetchScan?: (code: string) => Promise<ScanResponse>;
    fetchLocations?: () => Promise<LocationDto[]>;
    fetchCategories?: () => Promise<CategoryDto[]>;
    searchProducts?: (query: string) => Promise<ProductDto[]>;
    remove?: React.ComponentProps<typeof RemoveFlow>['api'];
    attachBarcode?: (productId: number, barcode: string) => Promise<ProductDto>;
  };
  makeScanner?: React.ComponentProps<typeof ScannerView>['makeScanner'];
}

type Step =
  | { name: 'scanning' }
  | { name: 'resolving' }
  | { name: 'add'; product: ProductDto; reason: 'scan_add' | 'manual'; full: boolean }
  | { name: 'search' }
  | { name: 'create'; productName: string }
  | { name: 'existing'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null }
  | { name: 'unknown'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null };

interface References {
  locations: LocationDto[];
  categories: CategoryDto[];
}

const NOTICE_MS = 4000;

export function ScanFlow({
  origin = null,
  onClose = () => undefined,
  statusSlot,
  renderUnknown,
  api = {},
  makeScanner,
}: ScanFlowProps) {
  const online = useOnline();
  const [mode, setMode] = useState<ScanMode>('add');
  const [step, setStep] = useState<Step>({ name: 'scanning' });
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const showNotice = (text: string, title = 'Scan impossible') => setNotice({ title, text });
  const [toast, setToast] = useState<AddedInfo | null>(null);
  /** Undo of each add of this session, the last one on top (« Annuler le dernier »). */
  const sessionStack = useRef<{ undo: () => Promise<void> }[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const pushSession = (undo: () => Promise<void>) => {
    sessionStack.current.push({ undo });
    setSessionCount(sessionStack.current.length);
  };
  const [readLabel, setReadLabel] = useState<string | null>(null);
  const [refs, setRefs] = useState<References | null>(null);
  /** Burst scan: a known product with a usual place is added in one gesture, without the form. */
  const [burst, setBurst] = useState(false);
  const burstRef = useRef(burst);
  useEffect(() => {
    burstRef.current = burst;
  });
  const controls = useRef<ScannerControls>(null);
  const busy = useRef(false);
  const referencesPromise = useRef<Promise<References> | null>(null);

  const loadReferences = useCallback((): Promise<References> => {
    referencesPromise.current ??= Promise.all([
      (api.fetchLocations ?? fetchLocations)(),
      (api.fetchCategories ?? fetchCategories)(),
    ])
      .then(([locations, categories]) => {
        const loaded = { locations, categories };
        setRefs(loaded);
        return loaded;
      })
      .catch((error: unknown) => {
        referencesPromise.current = null; // retried at the next scan
        throw error;
      });
    return referencesPromise.current;
    // The test seams are fixed for the life of the component.
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const openAdd = useCallback(
    async (product: ProductDto, reason: 'scan_add' | 'manual' = 'scan_add', full = false) => {
      try {
        await loadReferences();
        setStep({ name: 'add', product, reason, full: full || reason === 'manual' });
      } catch {
        setStep({ name: 'scanning' });
        showNotice('Impossible de charger les lieux et les catégories, réessayez.');
      }
    },
    [loadReferences],
  );

  const openSearch = async () => {
    setNotice(null);
    try {
      await loadReferences();
      setStep({ name: 'search' });
    } catch {
      showNotice('Impossible de charger les lieux et les catégories, réessayez.');
    }
  };

  /** Burst scan: +1 at the usual place, a toast with Annuler, the scanner stays open. */
  const burstAdd = async (product: ProductDto, locationId: number) => {
    const input = {
      productId: product.id,
      locationId,
      shelfId: null,
      expiryDate: null,
      delta: 1,
      reason: 'scan_add' as const,
    };
    try {
      const loaded = await loadReferences().catch(() => null);
      await adjustStock(input);
      const where = loaded?.locations.find((l) => l.id === locationId)?.name;
      pushSession(async () => {
        await adjustStock({ ...input, delta: -1, reason: 'correction' });
      });
      setToast({
        message: `Ajouté : 1 × ${product.name}${where ? `, ${where}` : ''}`,
        undo: () => undoLast(),
      });
      setStep({ name: 'scanning' });
    } catch (caught) {
      setStep({ name: 'scanning' });
      showNotice(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Ajout impossible : vérifiez la connexion.',
        'Ajout impossible',
      );
    }
  };

  const handleCode = useCallback(
    async (result: ScanResult) => {
      if (busy.current) return;
      busy.current = true;
      setNotice(null);
      setToast(null);
      setStep({ name: 'resolving' });
      try {
        const outcome = await resolveScan(result.code, result.format, {
          online,
          fetchScan: api.fetchScan ?? fetchScan,
        });
        switch (outcome.kind) {
          case 'invalid':
            showNotice(outcome.message);
            setStep({ name: 'scanning' });
            break;
          case 'offline':
            try {
              // Kept on the device (known product queued, unknown code to identify later).
              const kept = await handleOfflineScan(result.code);
              showNotice(
                kept.kind === 'queued'
                  ? `${kept.productName} : ${OFFLINE_SCAN_MESSAGE}`
                  : `Code ${kept.barcode} inconnu : ${OFFLINE_SCAN_MESSAGE}`,
                OFFLINE_MESSAGE,
              );
            } catch {
              showNotice('Réessayez quand la connexion sera revenue.', OFFLINE_MESSAGE);
            }
            setStep({ name: 'scanning' });
            break;
          case 'error':
            showNotice(outcome.message);
            setStep({ name: 'scanning' });
            break;
          case 'unknown':
            try {
              await loadReferences();
            } catch {
              showNotice('Impossible de charger les lieux et les catégories, réessayez.');
              setStep({ name: 'scanning' });
              break;
            }
            setStep({
              name: 'unknown',
              barcode: outcome.barcode,
              reason: outcome.reason,
              hints: outcome.hints,
            });
            break;
          case 'product':
            setReadLabel(outcome.product.name);
            if (burstRef.current && outcome.product.defaultLocationId !== null) {
              await burstAdd(outcome.product, outcome.product.defaultLocationId);
            } else {
              await openAdd(outcome.product);
            }
            break;
        }
      } finally {
        busy.current = false;
      }
    },
    // `api` holds test seams, fixed for the life of the component.
    [online, openAdd],
  );

  const removeCount = useRef(0);
  const [removeRequest, setRemoveRequest] = useState<RemoveRequest | null>(null);

  const onCode = (result: ScanResult, scanMode: ScanMode) => {
    setReadLabel(result.code);
    if (scanMode === 'remove') {
      setNotice(null);
      removeCount.current += 1;
      setRemoveRequest({ id: removeCount.current, result });
    } else void handleCode(result);
  };

  const changeMode = (next: ScanMode) => {
    setMode(next);
    setRemoveRequest(null);
    setNotice(null);
  };

  // The full-screen scanner stays on after an add: it is the screen for scanning (decision P4.14).
  const added = (info: AddedInfo) => {
    pushSession(info.undo);
    setToast({ ...info, undo: () => undoLast() });
    setStep({ name: 'scanning' });
  };

  const attach = async (picked: ProductDto, barcode: string) => {
    try {
      const updated = await (api.attachBarcode ?? attachBarcode)(picked.id, barcode);
      await openAdd(updated ?? picked);
    } catch (caught) {
      setStep({ name: 'scanning' });
      showNotice(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Rattachement impossible : vérifiez la connexion.',
        'Code non rattaché',
      );
    }
  };

  /** Takes back the last add of the session (the toast and the chip do the same). */
  const undoLast = async () => {
    const last = sessionStack.current.pop();
    if (!last) return;
    setSessionCount(sessionStack.current.length);
    setToast(null);
    try {
      await last.undo();
    } catch (error) {
      sessionStack.current.push(last);
      setSessionCount(sessionStack.current.length);
      showNotice(error instanceof ApiError ? error.message : 'Impossible d’annuler, réessayez.');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScannerView
        mode={mode}
        onModeChange={changeMode}
        onCode={onCode}
        onClose={onClose}
        paused={step.name !== 'scanning'}
        controlRef={controls}
        makeScanner={makeScanner}
        readLabel={readLabel}
        topSlot={statusSlot}
        overlay={
          <>
            {notice ? (
              <Callout role="alert" title={notice.title} className="w-full max-w-xl">
                {notice.text}
              </Callout>
            ) : null}
            {mode === 'remove' ? (
              <div className="w-full max-w-xl">
                <RemoveFlow
                  request={removeRequest}
                  api={api.remove}
                  onSwitchToAdd={(result) => {
                    changeMode('add');
                    void handleCode(result);
                  }}
                />
              </div>
            ) : null}
            {sessionCount > 0 ? (
              <div className="bg-scanner-veil text-scanner-ink flex items-center gap-3 rounded-full py-1 pr-1 pl-4">
                <p aria-live="polite" className="font-semibold">
                  {sessionCount} {sessionCount > 1 ? 'produits ajoutés' : 'produit ajouté'}
                </p>
                <button
                  type="button"
                  onClick={() => void undoLast()}
                  className="tap-target bg-scanner-frame text-scanner-on-frame rounded-full px-4 font-semibold"
                >
                  Annuler le dernier
                </button>
              </div>
            ) : null}
          </>
        }
        fallbacks={
          <div className="flex flex-col gap-3">
            <InAppBrowserNotice />
            <ManualCodeInput onCode={(result) => onCode(result, mode)} />
            <div className="flex flex-wrap items-center gap-x-4">
              <Button variant="secondary" onClick={() => void openSearch()}>
                Ajouter sans code-barres
              </Button>
              {mode === 'add' ? (
                <label className="tap-target text-indigo flex cursor-pointer items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={burst}
                    onChange={(event) => setBurst(event.target.checked)}
                    aria-describedby="burst-help"
                    className="accent-indigo h-5 w-5"
                  />
                  Scan en rafale
                </label>
              ) : null}
            </div>
            {mode === 'add' ? (
              <p id="burst-help" className="text-help -mt-2">
                Un produit connu avec un lieu habituel est ajouté d’un geste, sans formulaire. Les
                autres ouvrent le formulaire.
              </p>
            ) : null}
            <PhotoCodeButton onCode={(result) => onCode(result, mode)} />
          </div>
        }
      />

      {step.name === 'resolving' ? (
        <p role="status" className="text-small">
          Recherche du produit…
        </p>
      ) : null}

      {step.name === 'add' && refs && !step.full ? (
        <ScanSheet
          product={step.product}
          categories={refs.categories}
          locations={refs.locations}
          origin={origin}
          onAdded={(info) => added(info)}
          onMore={() => setStep({ ...step, full: true })}
          onClose={() => setStep({ name: 'scanning' })}
        />
      ) : null}

      {step.name === 'add' && refs && step.full ? (
        <AddSheet
          product={step.product}
          categories={refs.categories}
          locations={refs.locations}
          reason={step.reason}
          origin={origin}
          onAdded={added}
          onClose={() => setStep({ name: 'scanning' })}
        />
      ) : null}

      {step.name === 'search' ? (
        <CatalogSearch
          onPick={(product) => void openAdd(product, 'manual')}
          onCreate={(productName) => setStep({ name: 'create', productName })}
          onClose={() => setStep({ name: 'scanning' })}
          search={api.searchProducts}
        />
      ) : null}

      {step.name === 'create' && refs ? (
        <ProductForm
          barcode={null}
          reason="manual"
          initialName={step.productName}
          categories={refs.categories}
          locations={refs.locations}
          onCreated={(product, productNotice) => {
            if (productNotice) showNotice(productNotice, 'Photo non envoyée');
            void openAdd(product, 'manual');
          }}
          onCancel={() => setStep({ name: 'scanning' })}
        />
      ) : null}

      {step.name === 'unknown' && refs
        ? (() => {
            const context: UnknownContext = {
              barcode: step.barcode,
              reason: step.reason,
              hints: step.hints,
              onCreated: (product, productNotice) => {
                if (productNotice) showNotice(productNotice, 'Photo non envoyée');
                void openAdd(product);
              },
              onCancel: () => setStep({ name: 'scanning' }),
            };
            return (
              renderUnknown?.(context) ?? (
                <ProductForm
                  barcode={context.barcode}
                  reason={context.reason}
                  hints={context.hints}
                  categories={refs.categories}
                  locations={refs.locations}
                  onCreated={context.onCreated}
                  onCancel={context.onCancel}
                  onRescan={context.onCancel}
                  onExisting={() =>
                    setStep({
                      name: 'existing',
                      barcode: context.barcode,
                      reason: context.reason,
                      hints: context.hints,
                    })
                  }
                />
              )
            );
          })()
        : null}

      {step.name === 'existing' ? (
        <ProductPicker
          title="C’est un produit existant"
          help={`Choisissez le produit du catalogue : le code ${step.barcode} lui sera rattaché.`}
          search={api.searchProducts}
          onPick={(picked) => void attach(picked, step.barcode)}
          onClose={() =>
            setStep({
              name: 'unknown',
              barcode: step.barcode,
              reason: step.reason,
              hints: step.hints,
            })
          }
        />
      ) : null}

      {toast ? (
        <UndoToast
          message={toast.message}
          onUndo={() => void undoLast()}
          onExpire={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
