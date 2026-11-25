'use client';

import {
  LOCATION_KIND_DEFAULTS,
  LOCATION_KINDS,
  MAX_SHELVES_PER_LOCATION,
  PLACE_NAME_MAX_LENGTH,
  suggestLocationName,
  type LocationCreateInput,
  type LocationDto,
  type LocationKind,
} from '@inventaire/shared';
import { Minus, Plus } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { createLocation } from '../../lib/places-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';
import { FURNITURE_ICONS, OFFLINE_FURNITURE } from './furniture-kinds';

interface CreateFurnitureSheetProps {
  /** Names already used in the house: the suggested name avoids them. */
  existingNames: string[];
  onCreated: (location: LocationDto) => void;
  onClose: () => void;
  /** Test seam. */
  create?: (input: LocationCreateInput) => Promise<LocationDto>;
}

/** « étagère(s) », « tiroir(s) » or « rangée(s) », for the stepper of the kind. */
function shelfWord(kind: LocationKind, count: number): string {
  const word = LOCATION_KIND_DEFAULTS[kind].shelfLabel.toLowerCase();
  return count > 1 ? `${word}s` : word;
}

/** « Une étagère de plus », « Un tiroir de moins »… */
function stepLabel(kind: LocationKind, more: boolean): string {
  const label = LOCATION_KIND_DEFAULTS[kind].shelfLabel;
  const article = label === 'Tiroir' ? 'Un' : 'Une';
  return `${article} ${label.toLowerCase()} de ${more ? 'plus' : 'moins'}`;
}

const field = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3 text-base';

/**
 * Bottom sheet to add a piece of furniture: its kind (radio cards with an icon), its name
 * (suggested, « Frigo 2 »), and its number of shelves, drawers or rows (1 to 8). Creating needs the
 * network: offline, the sheet says so and sends nothing.
 */
export function CreateFurnitureSheet({
  existingNames,
  onCreated,
  onClose,
  create = createLocation,
}: CreateFurnitureSheetProps) {
  const titleId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const stepperLabelId = useId();
  const firstKind = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<LocationKind>('fridge');
  const [name, setName] = useState(() =>
    suggestLocationName(LOCATION_KIND_DEFAULTS.fridge.label, existingNames),
  );
  const [nameEdited, setNameEdited] = useState(false);
  const [shelfCount, setShelfCount] = useState(LOCATION_KIND_DEFAULTS.fridge.shelfCount);
  const [countEdited, setCountEdited] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chooseKind = (next: LocationKind) => {
    setKind(next);
    // The name and the count follow the kind until the person changes them.
    if (!nameEdited)
      setName(suggestLocationName(LOCATION_KIND_DEFAULTS[next].label, existingNames));
    if (!countEdited) setShelfCount(LOCATION_KIND_DEFAULTS[next].shelfCount);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PLACE_NAME_MAX_LENGTH) {
      setNameError(`Donnez un nom au meuble (${PLACE_NAME_MAX_LENGTH} caractères au plus).`);
      return;
    }
    if (existingNames.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())) {
      setNameError('Un meuble porte déjà ce nom : choisissez-en un autre.');
      return;
    }
    setNameError(null);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFormError(OFFLINE_FURNITURE);
      return;
    }
    setBusy(true);
    try {
      const created = await create({ name: trimmed, kind, shelfCount });
      onCreated(created);
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.status === 409 && /nom/i.test(caught.message)) {
        setNameError('Un meuble porte déjà ce nom : choisissez-en un autre.');
      } else if (caught instanceof ApiError && caught.status !== 0) {
        setFormError(caught.message);
      } else {
        setFormError(OFFLINE_FURNITURE);
      }
    }
  }

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose} initialFocus={firstKind}>
      <h2 id={titleId} className="text-card-title">
        Ajouter un meuble
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label mb-2">Type de meuble</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LOCATION_KINDS.map((value) => {
              const Icon = FURNITURE_ICONS[value];
              return (
                <label
                  key={value}
                  className="tap-target border-line text-indigo has-checked:border-indigo has-checked:bg-lavender has-focus-visible:outline-indigo-mid relative flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
                >
                  <input
                    // The checked card receives the focus when the sheet opens.
                    ref={kind === value ? firstKind : undefined}
                    type="radio"
                    name="furniture-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => chooseKind(value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="bg-lavender text-indigo inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <Icon size={18} />
                  </span>
                  {LOCATION_KIND_DEFAULTS[value].label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-label">
            Nom du meuble
          </label>
          <input
            id={nameId}
            className={`${field} ${nameError ? 'border-alert' : ''}`}
            value={name}
            maxLength={PLACE_NAME_MAX_LENGTH}
            enterKeyHint="done"
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
              setNameError(null);
            }}
          />
          {nameError ? (
            <p id={nameErrorId} className="text-small text-alert">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <span id={stepperLabelId} className="text-label">
            Nombre de {shelfWord(kind, 2)}
          </span>
          <div role="group" aria-labelledby={stepperLabelId} className="flex items-center gap-3">
            <button
              type="button"
              aria-label={stepLabel(kind, false)}
              disabled={shelfCount <= 1}
              onClick={() => {
                setShelfCount((n) => Math.max(1, n - 1));
                setCountEdited(true);
              }}
              className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full disabled:opacity-50"
            >
              <Minus size={20} aria-hidden="true" />
            </button>
            <output aria-live="polite" className="text-stat text-indigo min-w-[2ch] text-center">
              {shelfCount}
            </output>
            <button
              type="button"
              aria-label={stepLabel(kind, true)}
              disabled={shelfCount >= MAX_SHELVES_PER_LOCATION}
              onClick={() => {
                setShelfCount((n) => Math.min(MAX_SHELVES_PER_LOCATION, n + 1));
                setCountEdited(true);
              }}
              className="tap-target bg-amber text-indigo inline-flex items-center justify-center rounded-full disabled:opacity-50"
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <span className="text-small">
              {shelfWord(kind, shelfCount)}, {MAX_SHELVES_PER_LOCATION} au plus
            </span>
          </div>
        </div>

        {formError ? (
          <Callout role="alert" title="Meuble non ajouté">
            {formError}
          </Callout>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="add" disabled={busy}>
            {busy ? 'Ajout…' : 'Ajouter le meuble'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
