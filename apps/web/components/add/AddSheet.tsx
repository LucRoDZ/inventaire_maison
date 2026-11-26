'use client';

import type {
  AdjustReason,
  CategoryDto,
  LocationDto,
  ProductDto,
  StockAdjustInput,
  StockAdjustResponse,
} from '@inventaire/shared';
import { Package } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  pickInitialPlace,
  readLastLocation,
  saveLastLocation,
  type Place,
} from '../../lib/add-place';
import { useOnline } from '../../lib/online';
import { adjustStock, updateProductCategory } from '../../lib/stock-api';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { categoryIcon } from '../ui/CategoryIcon';
import { IconBadge } from '../ui/IconBadge';
import { CategoryPicker } from './CategoryPicker';
import { LocationPicker } from './LocationPicker';
import { QuantityStepper } from './QuantityStepper';

export interface AddedInfo {
  /** « Ajouté : 2 × Lait demi-écrémé, Frigo, étagère 2 » */
  message: string;
  /** Takes the units back (movement `correction`). */
  undo: () => Promise<void>;
}

interface AddSheetProps {
  product: ProductDto;
  categories: CategoryDto[];
  locations: LocationDto[];
  /** `scan_add` when a code opened the sheet, `manual` for an add by name. */
  reason: Extract<AdjustReason, 'scan_add' | 'manual'>;
  /** Furniture and shelf the scanner was opened from. */
  origin?: { locationId: number; shelfId?: number | null } | null;
  onAdded: (info: AddedInfo, scanNext: boolean) => void;
  onClose: () => void;
  /** Test seams. */
  adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  confirmCategory?: (productId: number, categoryId: number) => Promise<unknown>;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function AddSheet({
  product,
  categories,
  locations,
  reason,
  origin,
  onAdded,
  onClose,
  adjust = adjustStock,
  confirmCategory = updateProductCategory,
}: AddSheetProps) {
  const titleId = useId();
  const online = useOnline();
  const [quantity, setQuantity] = useState(1);
  const [expiryDate, setExpiryDate] = useState('');
  const [place, setPlace] = useState<Place | null>(() =>
    pickInitialPlace({
      locations,
      origin,
      usualLocationId: product.defaultLocationId,
      lastLocationId: readLastLocation(),
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The category shown here is the one that is saved when the product is added: a guessed category
  // is confirmed by adding, a category picked here replaces it (one request, before the stock).
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const category = categories.find((c) => c.id === categoryId);
  const Glyph = category ? categoryIcon(category.icon) : Package;
  // The grid takes most of the screen: it opens by itself only when nothing useful was proposed
  // (« Autre » or no category); a proposal worth confirming shows as one line, « Changer » opens it.
  const proposedCategory = categories.find((c) => c.id === product.categoryId);
  const [expanded, setExpanded] = useState(
    () => product.categoryGuessed && (proposedCategory?.isFallback ?? true),
  );

  const submit = async (scanNext: boolean) => {
    if (!place || busy) return;
    setBusy(true);
    setError(null);
    const input: StockAdjustInput = {
      productId: product.id,
      locationId: place.locationId,
      shelfId: place.shelfId,
      expiryDate: expiryDate || null,
      delta: quantity,
      reason,
    };
    try {
      if (product.categoryGuessed || categoryId !== product.categoryId) {
        await confirmCategory(product.id, categoryId);
      }
      await adjust(input);
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Impossible d’ajouter : vérifiez la connexion et réessayez.',
      );
      return;
    }
    saveLastLocation(place.locationId);
    const locationName = locations.find((l) => l.id === place.locationId)?.name ?? '';
    const shelfName = locations
      .find((l) => l.id === place.locationId)
      ?.shelves.find((s) => s.id === place.shelfId)?.name;
    onAdded(
      {
        message: `Ajouté : ${quantity} × ${product.name}, ${locationName}${
          shelfName ? `, ${lowerFirst(shelfName)}` : ''
        }`,
        undo: async () => {
          await adjust({ ...input, delta: -quantity, reason: 'correction' });
        },
      },
      scanNext,
    );
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-indigo/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className="rounded-card bg-white mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-3">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <IconBadge icon={Glyph} />
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-card-title">
              {product.name}
            </h2>
            <p className="text-small">
              {[product.brand, category?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {expanded ? (
          <CategoryPicker
            categories={categories}
            value={categoryId}
            proposedId={product.categoryGuessed ? product.categoryId : null}
            onChange={setCategoryId}
            disabled={busy}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-small min-w-0">
              {product.categoryGuessed ? 'Catégorie proposée : ' : 'Catégorie : '}
              <strong>{category?.name ?? 'Inconnue'}</strong>
            </p>
            <Button
              variant="secondary"
              aria-label="Changer la catégorie"
              onClick={() => setExpanded(true)}
            >
              Changer
            </Button>
          </div>
        )}

        {!online ? (
          <Callout role="alert" title="Pas de connexion">
            L’ajout est indisponible tant que la connexion n’est pas revenue.
          </Callout>
        ) : null}

        <QuantityStepper value={quantity} onChange={setQuantity} />

        {place ? <LocationPicker locations={locations} value={place} onChange={setPlace} /> : null}

        <label className="text-label flex flex-col gap-1">
          Date limite (facultative)
          <input
            type="date"
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
            className="tap-target border-line text-ink rounded-xl border bg-white px-3"
          />
        </label>

        {error ? (
          <Callout role="alert" title="Ajout impossible">
            {error}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            disabled={busy || !online || !place}
            onClick={() => void submit(false)}
          >
            Ajouter
          </Button>
          <Button
            variant="outline"
            disabled={busy || !online || !place}
            onClick={() => void submit(true)}
          >
            Ajouter et scanner le suivant
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
