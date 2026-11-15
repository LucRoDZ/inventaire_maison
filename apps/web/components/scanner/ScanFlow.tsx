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
import { fetchCategories, fetchLocations } from '../../lib/stock-api';
import type { ScanResult } from '../../lib/scanner/types';
import { AddSheet, type AddedInfo } from '../add/AddSheet';
import { UndoToast } from '../add/UndoToast';
import { Callout } from '../ui/Callout';
import { InAppBrowserNotice } from './InAppBrowserNotice';
import { ManualCodeInput } from './ManualCodeInput';
import { PhotoCodeButton } from './PhotoCodeButton';
import { ScannerView, type ScanMode, type ScannerControls } from './ScannerView';

export interface UnknownContext {
  barcode: string;
  reason: ScanUnknownReason;
  hints: ScanHints | null;
  /** The product now exists: carry on with the add sheet. */
  onCreated: (product: ProductDto) => void;
  onCancel: () => void;
}

interface ScanFlowProps {
  /** Furniture and shelf the scanner was opened from, when it was. */
  origin?: { locationId: number; shelfId?: number | null } | null;
  /** The creation form (task 1.18) for a code Open Food Facts could not describe. */
  renderUnknown?: (context: UnknownContext) => ReactNode;
  /** Removal mode (task 1.20); without it a code read in that mode is ignored. */
  onRemoveCode?: (result: ScanResult) => void;
  /** Test seams. */
  api?: {
    fetchScan?: (code: string) => Promise<ScanResponse>;
    fetchLocations?: () => Promise<LocationDto[]>;
    fetchCategories?: () => Promise<CategoryDto[]>;
  };
  makeScanner?: React.ComponentProps<typeof ScannerView>['makeScanner'];
}

type Step =
  | { name: 'scanning' }
  | { name: 'resolving' }
  | { name: 'add'; product: ProductDto; reason: 'scan_add' | 'manual' }
  | { name: 'unknown'; barcode: string; reason: ScanUnknownReason; hints: ScanHints | null };

interface References {
  locations: LocationDto[];
  categories: CategoryDto[];
}

const NOTICE_MS = 4000;

export function ScanFlow({
  origin = null,
  renderUnknown,
  onRemoveCode,
  api = {},
  makeScanner,
}: ScanFlowProps) {
  const online = useOnline();
  const [mode, setMode] = useState<ScanMode>('add');
  const [step, setStep] = useState<Step>({ name: 'scanning' });
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<AddedInfo | null>(null);
  const [refs, setRefs] = useState<References | null>(null);
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
        setNotice('Impossible de charger les lieux et les catégories, réessayez.');
      }
    },
    [loadReferences],
  );

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
            setNotice(outcome.message);
            setStep({ name: 'scanning' });
            break;
          case 'offline':
            setNotice(OFFLINE_MESSAGE);
            setStep({ name: 'scanning' });
            break;
          case 'error':
            setNotice(outcome.message);
            setStep({ name: 'scanning' });
            break;
          case 'unknown':
            setStep({
              name: 'unknown',
              barcode: outcome.barcode,
              reason: outcome.reason,
              hints: outcome.hints,
            });
            break;
          case 'product':
            await openAdd(outcome.product);
            break;
        }
      } finally {
        busy.current = false;
      }
    },
    // `api` holds test seams, fixed for the life of the component.
    [online, openAdd],
  );

  const onCode = (result: ScanResult, scanMode: ScanMode) => {
    if (scanMode === 'remove') onRemoveCode?.(result);
    else void handleCode(result);
  };

  const added = (info: AddedInfo, scanNext: boolean) => {
    setToast(info);
    setStep({ name: 'scanning' });
    if (!scanNext) controls.current?.stopCamera();
  };

  const undo = async () => {
    const current = toast;
    setToast(null);
    try {
      await current?.undo();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Impossible d’annuler, réessayez.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Callout
          role="alert"
          title={notice === OFFLINE_MESSAGE ? OFFLINE_MESSAGE : 'Scan impossible'}
        >
          {notice === OFFLINE_MESSAGE ? 'Réessayez quand la connexion sera revenue.' : notice}
        </Callout>
      ) : null}

      <ScannerView
        mode={mode}
        onModeChange={setMode}
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

      {step.name === 'unknown'
        ? (renderUnknown?.({
            barcode: step.barcode,
            reason: step.reason,
            hints: step.hints,
            onCreated: (product) => void openAdd(product),
            onCancel: () => setStep({ name: 'scanning' }),
          }) ?? (
            <Callout role="alert" title="Produit inconnu">
              Ce code n’est pas encore au catalogue.
            </Callout>
          ))
        : null}

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
