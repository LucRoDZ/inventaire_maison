'use client';

import { useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { FURNITURE_ICON_CHOICES } from '../../lib/furniture-edit';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { placeIcon } from '../ui/CategoryIcon';
import { iconLabel } from '../ui/icon-labels';

interface IconPickerSheetProps {
  /** Name of the piece of furniture, for the title. */
  name: string;
  icon: string;
  save: (icon: string) => Promise<unknown>;
  onSaved: (icon: string) => void;
  onClose: () => void;
}

/**
 * The icon of a piece of furniture, chosen in a grid: one radio button per icon, each named in
 * French. The arrows move in the grid (native radio group); « Enregistrer » writes the choice.
 */
export function IconPickerSheet({ name, icon, save, onSaved, onClose }: IconPickerSheetProps) {
  const titleId = useId();
  const group = useId();
  const [choice, setChoice] = useState(icon);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checked = useRef<HTMLInputElement>(null);
  const choices = FURNITURE_ICON_CHOICES.includes(icon)
    ? FURNITURE_ICON_CHOICES
    : [icon, ...FURNITURE_ICON_CHOICES];

  async function confirm() {
    if (busy) return;
    if (choice === icon) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save(choice);
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Pas de connexion : réessayez une fois en ligne.',
      );
      return;
    }
    onSaved(choice);
  }

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose} initialFocus={checked} layer="top">
      <h2 id={titleId} className="text-card-title">
        Icône de {name}
      </h2>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2"
      >
        {choices.map((value) => {
          const Icon = placeIcon(value);
          return (
            <label
              key={value}
              title={iconLabel(value)}
              className="tap-target border-line text-indigo has-checked:border-indigo has-checked:bg-lavender has-focus-visible:outline-indigo-mid relative flex aspect-square cursor-pointer items-center justify-center rounded-xl border bg-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
            >
              <input
                ref={value === choice ? checked : undefined}
                type="radio"
                name={group}
                value={value}
                checked={value === choice}
                onChange={() => setChoice(value)}
                aria-label={iconLabel(value)}
                className="sr-only"
              />
              <Icon size={24} aria-hidden="true" />
            </label>
          );
        })}
      </div>
      {error ? (
        <Callout role="alert" title="Icône non enregistrée">
          {error}
        </Callout>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button aria-disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Enregistrement…' : 'Enregistrer l’icône'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </BottomSheet>
  );
}
