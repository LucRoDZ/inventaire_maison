'use client';

import type { LocationDto, StockMoveInput, StockMoveResponse } from '@inventaire/shared';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/api';
import { moveStock } from '../../lib/stock-api';
import { QuantityStepper } from '../add/QuantityStepper';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

export interface MoveSource {
  stockItemId: number;
  productName: string;
  locationId: number;
  shelfId: number | null;
  /** Units on the line. */
  quantity: number;
}

interface MoveDialogProps {
  source: MoveSource;
  locations: LocationDto[];
  /** `message` is the confirmation to show once the sheet is closed. */
  onMoved: (message: string) => void;
  onClose: () => void;
  /** Test seam. */
  move?: (input: StockMoveInput) => Promise<StockMoveResponse>;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const select = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3';

/** « Déplacer vers… »: furniture, shelf (or « Non rangé »), and how many units (all by default). */
export function MoveDialog({
  source,
  locations,
  onMoved,
  onClose,
  move = moveStock,
}: MoveDialogProps) {
  const titleId = useId();
  const [locationId, setLocationId] = useState(source.locationId);
  const [shelfId, setShelfId] = useState<number | null>(source.shelfId);
  const [quantity, setQuantity] = useState(source.quantity);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = locations.find((l) => l.id === locationId);
  const same = locationId === source.locationId && shelfId === source.shelfId;

  const submit = async () => {
    if (same || busy) return;
    setBusy(true);
    setError(null);
    try {
      await move({
        stockItemId: source.stockItemId,
        toLocationId: locationId,
        toShelfId: shelfId,
        quantity,
      });
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Déplacement impossible : vérifiez la connexion et réessayez.',
      );
      return;
    }
    const shelfName = target?.shelves.find((s) => s.id === shelfId)?.name;
    onMoved(
      `Déplacé : ${quantity} × ${source.productName} vers ${target?.name ?? ''}${
        shelfName ? `, ${lowerFirst(shelfName)}` : ''
      }`,
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-indigo/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className="rounded-card mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-b-none bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={titleId} className="text-card-title">
          Déplacer {source.productName} vers…
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-label flex flex-col gap-1">
            Meuble
            <select
              className={select}
              value={locationId}
              onChange={(event) => {
                setLocationId(Number(event.target.value));
                setShelfId(null);
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-label flex flex-col gap-1">
            Étagère
            <select
              className={select}
              value={shelfId ?? ''}
              onChange={(event) =>
                setShelfId(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              <option value="">Non rangé</option>
              {target?.shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {source.quantity > 1 ? (
          <div className="flex flex-col gap-1">
            <span className="text-label">Quantité à déplacer</span>
            <QuantityStepper value={quantity} onChange={setQuantity} max={source.quantity} />
          </div>
        ) : null}

        {same ? (
          <p role="status" className="text-small">
            C’est déjà là : choisissez une autre destination.
          </p>
        ) : null}
        {error ? (
          <Callout role="alert" title="Déplacement impossible">
            {error}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button variant="add" disabled={same || busy} onClick={() => void submit()}>
            Déplacer
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
