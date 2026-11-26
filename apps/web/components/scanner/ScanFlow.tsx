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
  | { name: 'add'; product: ProductDto; reason: 'scan_add' | 'manual' }
  | { name: 'search' }
  | { name: 'create'; productName: string }
  | { name: 'existing'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null }
  | { name: 'unknown'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null };

interface References {
  locations: LocationDto[];
  categories: CategoryDto[];
}

const NOTICE_MS = 4000;

export function ScanFlow({ origin = null, renderUnknown, api = {}, makeScanner }: ScanFlowProps) {
  const online = useOnline();
  const [mode, setMode] = useState<ScanMode>('add');
  const [step, setStep] = useState<Step>({ name: 'scanning' });
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const showNotice = (text: string, title = 'Scan impossible') => setNotice({ title, text });
  const [toast, setToast] = useState<AddedInfo | null>(null);
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
    async (product: ProductDto, reason: 'scan_add' | 'manual' = 'scan_add') => {
      try {
        await loadReferences();
        setStep({ name: 'add', product, reason });
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
      setToast({
        message: `Ajouté : 1 × ${product.name}${where ? `, ${where}` : ''}`,
        undo: async () => {
          await adjustStock({ ...input, delta: -1, reason: 'correction' });
        },
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
            showNotice('Réessayez quand la connexion sera revenue.', OFFLINE_MESSAGE);
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

  const added = (info: AddedInfo, scanNext: boolean) => {
    setToast(info);
    setStep({ name: 'scanning' });
    if (!scanNext) controls.current?.stopCamera();
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

  const undo = async () => {
    const current = toast;
    setToast(null);
    try {
      await current?.undo();
    } catch (error) {
      showNotice(error instanceof ApiError ? error.message : 'Impossible d’annuler, réessayez.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Callout role="alert" title={notice.title}>
          {notice.text}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4">
        <Button variant="secondary" className="self-start" onClick={() => void openSearch()}>
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
      {mode === 'add' && burst ? (
        <p id="burst-help" className="text-help -mt-2">
          Un produit connu avec un lieu habituel est ajouté d’un geste, sans formulaire. Les autres
          ouvrent le formulaire.
        </p>
      ) : null}

      <ScannerView
        mode={mode}
        onModeChange={changeMode}
        onCode={onCode}
        paused={step.name !== 'scanning'}
        controlRef={controls}
        makeScanner={makeScanner}
        fallbacks={
          <div className="flex flex-col gap-3">
            <InAppBrowserNotice />
            <ManualCodeInput onCode={(result) => onCode(result, mode)} />
            <PhotoCodeButton onCode={(result) => onCode(result, mode)} />
          </div>
        }
      />

      {mode === 'remove' ? (
        <RemoveFlow
          request={removeRequest}
          api={api.remove}
          onSwitchToAdd={(result) => {
            changeMode('add');
            void handleCode(result);
          }}
        />
      ) : null}

      {step.name === 'resolving' ? (
        <p role="status" className="text-small">
          Recherche du produit…
        </p>
      ) : null}

      {step.name === 'add' && refs ? (
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
          onUndo={() => void undo()}
          onExpire={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
