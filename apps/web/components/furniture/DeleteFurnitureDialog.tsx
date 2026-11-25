'use client';

import type { LocationDto } from '@inventaire/shared';
import { useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { deleteLocation } from '../../lib/places-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { LocationOptions } from '../ui/LocationOptions';
import { OFFLINE_FURNITURE } from './furniture-kinds';

interface DeleteFurnitureDialogProps {
  location: LocationDto;
  /** Every piece of furniture of the house (the destination is chosen among the others). */
  locations: LocationDto[];
  onDeleted: (message: string) => void;
  onClose: () => void;
  /** Test seam. */
  remove?: (id: number, moveStockTo?: number) => Promise<void>;
}

const select = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3 text-base';

const products = (n: number) => `${n} ${n > 1 ? 'produits' : 'produit'}`;

/**
 * Confirmation of a rare and structuring action (no undo): it names the piece of furniture and
 * what happens to its products. « Annuler » has the focus; Échap cancels. When the furniture holds
 * products, the destination is chosen in the same dialog and is mandatory.
 */
export function DeleteFurnitureDialog({
  location,
  locations,
  onDeleted,
  onClose,
  remove = deleteLocation,
}: DeleteFurnitureDialogProps) {
  const titleId = useId();
  const consequenceId = useId();
  const destinationId = useId();
  const destinationErrorId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const others = locations.filter((other) => other.id !== location.id);
  const holdsStock = location.productCount > 0;
  const [destination, setDestination] = useState<number | null>(null);
  const [destinationError, setDestinationError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = others.find((other) => other.id === destination);

  const consequence = !holdsStock
    ? 'Il est vide : il disparaît avec ses étagères.'
    : others.length === 0
      ? `Il contient ${products(location.productCount)} et c’est votre seul meuble : ajoutez d’abord un autre meuble pour les recevoir.`
      : `${
          location.productCount > 1
            ? `Ses ${location.productCount} produits seront rangés`
            : 'Son produit sera rangé'
        } dans le plateau « Non rangé » ${target ? `de ${target.name}` : 'du meuble choisi ci-dessous'}.`;

  async function confirm() {
    if (busy) return;
    setError(null);
    if (holdsStock && destination === null) {
      setDestinationError(true);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(OFFLINE_FURNITURE);
      return;
    }
    setBusy(true);
    try {
      await remove(location.id, holdsStock ? (destination ?? undefined) : undefined);
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof ApiError && caught.status !== 0 ? caught.message : OFFLINE_FURNITURE,
      );
      return;
    }
    onDeleted(
      holdsStock && target
        ? `${location.name} supprimé : ses produits sont dans le plateau « Non rangé » de ${target.name}.`
        : `${location.name} supprimé.`,
    );
  }

  const blocked = holdsStock && others.length === 0;

  return (
    <BottomSheet
      role="alertdialog"
      labelledBy={titleId}
      describedBy={consequenceId}
      onClose={onClose}
      initialFocus={cancel}
      closeOnBackdrop={false}
      layer="top"
    >
      <h2 id={titleId} className="text-card-title">
        Supprimer {location.name} ?
      </h2>
      <p id={consequenceId} className="text-body">
        {consequence}
      </p>
      {holdsStock && !blocked ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={destinationId} className="text-label">
            Meuble qui reçoit les produits
          </label>
          <select
            id={destinationId}
            className={`${select} ${destinationError ? 'border-alert' : ''}`}
            value={destination ?? ''}
            aria-invalid={destinationError ? true : undefined}
            aria-describedby={destinationError ? destinationErrorId : undefined}
            onChange={(event) => {
              setDestination(event.target.value === '' ? null : Number(event.target.value));
              setDestinationError(false);
            }}
          >
            <option value="">Choisir un meuble</option>
            <LocationOptions locations={others} />
          </select>
          {destinationError ? (
            <p id={destinationErrorId} className="text-small text-alert">
              Choisissez le meuble qui recevra les produits.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-small">Cette suppression ne peut pas être annulée.</p>
      {error ? (
        <Callout role="alert" title="Meuble non supprimé">
          {error}
        </Callout>
      ) : null}
      <div className="flex flex-col gap-2">
        {blocked ? null : (
          <Button disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Suppression…' : `Supprimer ${location.name}`}
          </Button>
        )}
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}
