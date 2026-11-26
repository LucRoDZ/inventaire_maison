'use client';

import type {
  AdjustReason,
  HomeTileDto,
  LocationDto,
  StockAdjustInput,
  StockAdjustResponse,
  StockMoveInput,
  StockMoveResponse,
} from '@inventaire/shared';
import { Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import { adjustStock } from '../../lib/stock-api';
import { ExpiryBadge } from '../list/ExpiryBadge';
import { BottomSheet } from '../ui/BottomSheet';
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

  const change = async (delta: 1 | -1, reason: AdjustReason = 'manual') => {
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
        reason,
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
      <BottomSheet labelledBy={titleId} onClose={onClose}>
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
            onClick={() => void change(-1, 'consumed')}
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
            className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-lavender-line"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
          <Button variant="outline" disabled={busy} onClick={() => void change(-1, 'wasted')}>
            <Trash2 size={18} aria-hidden="true" />
            Jeté<span className="sr-only"> : retirer une unité jetée</span>
          </Button>
        </div>
        <p className="text-help -mt-2">
          « − » note une unité consommée, « Jeté » une unité à la poubelle.
        </p>

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
          <Button variant="primary" onClick={() => setMoving(true)}>
            Déplacer vers…
          </Button>
          <Link
            href={`/produits/${tile.productId}`}
            className="tap-target text-indigo-mid inline-flex items-center justify-center font-semibold"
          >
            Voir la fiche produit
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </BottomSheet>

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
