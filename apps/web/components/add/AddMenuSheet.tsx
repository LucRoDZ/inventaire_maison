'use client';

import type { CategoryDto, LocationDto, ProductDto } from '@inventaire/shared';
import { History, PencilLine, ScanBarcode, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { fetchCategories, fetchLocations } from '../../lib/stock-api';
import { ProductForm } from '../product/ProductForm';
import { BottomSheet } from '../ui/BottomSheet';
import { ErrorMessage } from '../ui/ErrorMessage';
import { AddSheet, type AddedInfo } from './AddSheet';
import { CatalogSearch } from './CatalogSearch';

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

interface RowProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}

function Row({ icon: Icon, label, hint, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-target text-indigo hover:bg-lavender flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
    >
      <span className="flex w-8 shrink-0 items-center justify-center">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="text-help text-grey block">{hint}</span>
      </span>
    </button>
  );
}

/**
 * The « Ajouter » sheet: add again (full page), scan, or add by name. Manual add reuses the catalogue search and the add sheet of the scanner.
 */
export function AddMenuSheet({ onClose, onNotify }: AddMenuSheetProps) {
  const titleId = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'menu' });
  const [refs, setRefs] = useState<{ categories: CategoryDto[]; locations: LocationDto[] } | null>(
    null,
  );
  const [refsFailed, setRefsFailed] = useState(false);
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
          onClick={() => {
            onClose();
            router.push('/ajouter-a-nouveau');
          }}
        />
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
