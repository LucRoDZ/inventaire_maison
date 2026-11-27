'use client';

import type { LocationDto, ShelfDto } from '@inventaire/shared';
import { useId, useRef, useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';

/** Confirmation before a shelf goes: its stock returns to the « Non rangé » tray. */
export function DeleteShelfDialog({
  shelf,
  location,
  onConfirm,
  onClose,
}: {
  shelf: ShelfDto;
  location: LocationDto;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet
      role="alertdialog"
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      initialFocus={cancel}
      closeOnBackdrop={false}
      layer="top"
    >
      <h2 id={titleId} className="text-card-title">
        Supprimer {shelf.name} ?
      </h2>
      <p id={textId} className="text-body">
        Ses produits restent dans {location.name}, sur le plateau « Non rangé ».
      </p>
      <div className="flex flex-col gap-2">
        <Button
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            void onConfirm().finally(() => setBusy(false));
          }}
        >
          {busy ? 'Suppression…' : `Supprimer ${shelf.name}`}
        </Button>
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}
