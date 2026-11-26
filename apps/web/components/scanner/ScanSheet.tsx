'use client';

import type {
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
import type { AddedInfo } from '../add/AddSheet';
import { LocationPicker } from '../add/LocationPicker';
import { QuantityStepper } from '../add/QuantityStepper';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { categoryIcon } from '../ui/CategoryIcon';
import { IconBadge } from '../ui/IconBadge';

interface ScanSheetProps {
  product: ProductDto;
  categories: CategoryDto[];
  locations: LocationDto[];
  /** Furniture and shelf the scanner was opened from. */
  origin?: { locationId: number; shelfId?: number | null } | null;
  onAdded: (info: AddedInfo) => void;
  /** Category, dates, content: the full add sheet. */
  onMore: () => void;
  onClose: () => void;
  /** Test seams. */
  adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
  confirmCategory?: (productId: number, categoryId: number) => Promise<unknown>;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The sheet that rises over the camera as soon as a code is answered: photo, name, quantity and
 * place (the usual one, preselected). One tap on « Ajouter » and the camera is ready again.
 */
export function ScanSheet({
  product,
  categories,
  locations,
  origin,
  onAdded,
  onMore,
  onClose,
  adjust = adjustStock,
  confirmCategory = updateProductCategory,
}: ScanSheetProps) {
  const titleId = useId();
  const online = useOnline();
  const [quantity, setQuantity] = useState(1);
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
  const category = categories.find((c) => c.id === product.categoryId);
  const Glyph = category ? categoryIcon(category.icon) : Package;

  const submit = async () => {
    if (!place || busy) return;
    setBusy(true);
    setError(null);
    const input: StockAdjustInput = {
      productId: product.id,
      locationId: place.locationId,
      shelfId: place.shelfId,
      expiryDate: null,
      delta: quantity,
      reason: 'scan_add',
    };
    try {
      // A guessed category is confirmed by adding, as in the full sheet.
      if (product.categoryGuessed) await confirmCategory(product.id, product.categoryId);
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
    const where = locations.find((l) => l.id === place.locationId);
    const shelfName = where?.shelves.find((s) => s.id === place.shelfId)?.name;
    onAdded({
      message: `Ajouté : ${quantity} × ${product.name}, ${where?.name ?? ''}${
        shelfName ? `, ${lowerFirst(shelfName)}` : ''
      }`,
      undo: async () => {
        await adjust({ ...input, delta: -quantity, reason: 'correction' });
      },
    });
  };

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <div className="flex items-center gap-3">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <IconBadge icon={Glyph} />
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-card-title">
            {product.name}
          </h2>
          <p className="text-small">
            {[
              product.brand,
              category
                ? `${product.categoryGuessed ? 'Catégorie proposée : ' : ''}${category.name}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      {!online ? (
        <Callout role="alert" title="Pas de connexion">
          L’ajout est indisponible tant que la connexion n’est pas revenue.
        </Callout>
      ) : null}

      <QuantityStepper value={quantity} onChange={setQuantity} />
      {place ? <LocationPicker locations={locations} value={place} onChange={setPlace} /> : null}

      {error ? (
        <Callout role="alert" title="Ajout impossible">
          {error}
        </Callout>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button disabled={busy || !online || !place} onClick={() => void submit()}>
          Ajouter
        </Button>
        <Button variant="outline" onClick={onMore}>
          Plus d’options
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}
