'use client';

import type {
  HomeTileDto,
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  StockMoveInput,
  StockMoveResponse,
} from '@inventaire/shared';
import { Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import { adjustStock } from '../../lib/stock-api';
import { ExpiryBadge } from '../list/ExpiryBadge';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { categoryIcon } from '../ui/CategoryIcon';
import { IconBadge } from '../ui/IconBadge';
import { MoveDialog } from './MoveDialog';

interface ProductSheetProps {
  tile: HomeTileDto;
  /** Where the line is. */
  place: {
    locationId: number;
    shelfId: number | null;
    locationName: string;
    shelfName: string | null;
  };
  locations: LocationDto[];
  /** Something changed on the server: reload the furniture. `message` is a confirmation to show. */
  onChanged: (message?: string) => void;
  onClose: () => void;
  /** Test seams. */
  api?: {
    adjust?: (input: StockAdjustInput) => Promise<StockAdjustResponse>;
    move?: (input: StockMoveInput) => Promise<StockMoveResponse>;
  };
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Bottom sheet of a tile: quantity, expiry date, product page, and « Déplacer vers… ». */
export function ProductSheet({
  tile,
  place,
  locations,
  onChanged,
  onClose,
  api = {},
}: ProductSheetProps) {
  const titleId = useId();
  const [quantity, setQuantity] = useState(tile.quantity);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const Glyph = categoryIcon(tile.category.icon);

  const change = async (delta: 1 | -1) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await (api.adjust ?? adjustStock)({
        productId: tile.productId,
        locationId: place.locationId,
        shelfId: place.shelfId,
        expiryDate: tile.expiryDate,
        delta,
        reason: 'manual',
      });
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Modification impossible : vérifiez la connexion.',
      );
      return;
    }
    setBusy(false);
    const next = quantity + delta;
    setQuantity(next);
    onChanged();
    if (next <= 0) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-30 flex items-end bg-indigo/40" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
          className="rounded-card mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center gap-3">
            {tile.imageUrl ? (
              <img src={tile.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <IconBadge icon={Glyph} />
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-card-title">
                {tile.name}
              </h2>
              <p className="text-small">
                {[place.locationName, place.shelfName ?? 'Non rangé'].join(', ')}
              </p>
            </div>
          </div>

          <div role="group" aria-label="Quantité" className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Retirer une unité"
              disabled={busy}
              onClick={() => void change(-1)}
              className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full"
            >
              <Minus size={20} aria-hidden="true" />
            </button>
            <output
              aria-label="Quantité en stock"
              className="text-stat text-indigo min-w-[2ch] text-center"
            >
              {quantity}
            </output>
            <button
              type="button"
              aria-label="Ajouter une unité"
              disabled={busy}
              onClick={() => void change(1)}
              className="tap-target bg-amber text-indigo inline-flex items-center justify-center rounded-full"
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          </div>

          <p className="text-body flex flex-wrap items-center gap-2">
            Date limite : {tile.expiryDate ? formatDate(tile.expiryDate) : 'aucune'}
            <ExpiryBadge expiry={tile.expiry} />
          </p>

          {error ? (
            <Callout role="alert" title="Un instant">
              {error}
            </Callout>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button variant="add" onClick={() => setMoving(true)}>
              Déplacer vers…
            </Button>
            <Link
              href={`/produits/${tile.productId}`}
              className="tap-target text-indigo-mid inline-flex items-center justify-center font-bold"
            >
              Voir la fiche produit
            </Link>
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
      </div>

      {moving ? (
        <MoveDialog
          source={{
            stockItemId: tile.stockItemId,
            productName: tile.name,
            locationId: place.locationId,
            shelfId: place.shelfId,
            quantity,
          }}
          locations={locations}
          move={api.move}
          onClose={() => setMoving(false)}
          onMoved={(message) => {
            setMoving(false);
            onChanged(message);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
