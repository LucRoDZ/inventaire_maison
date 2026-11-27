'use client';

import type { LocationDto } from '@inventaire/shared';
import { ArrowDown, ArrowUp, Ellipsis, ImageIcon, Pencil, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { reorder } from '../../lib/furniture-edit';
import * as placesApi from '../../lib/places-api';
import { BottomSheet } from '../ui/BottomSheet';
import { Callout } from '../ui/Callout';
import { DeleteFurnitureDialog } from './DeleteFurnitureDialog';
import { IconPickerSheet } from './IconPickerSheet';
import { RenameFurnitureSheet } from './RenameFurnitureSheet';

type Api = Pick<typeof placesApi, 'fetchLocations' | 'updateLocation' | 'deleteLocation'>;

export type FurnitureChange =
  { kind: 'renamed' | 'icon' | 'moved'; message: string } | { kind: 'deleted'; message: string };

/** Id of the « ⋯ » button of a piece of furniture, to give it the focus back after a change. */
export const furnitureOptionsId = (locationId: number) => `options-meuble-${locationId}`;

interface FurnitureOptionsProps {
  locationId: number;
  name: string;
  /** After each change, with a sentence that says it (the caller reloads and announces). */
  onChanged: (change: FurnitureChange) => void;
  className?: string;
  /** Test seam. */
  api?: Api;
}

type Step = 'closed' | 'menu' | 'rename' | 'icon' | 'delete';

function MenuItem({
  icon,
  children,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        // aria-disabled, not disabled: the item stays reachable and says why it does nothing.
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className="tap-target text-indigo hover:bg-lavender flex w-full items-center gap-3 rounded-xl px-3 text-left font-semibold transition-colors duration-150 ease-out aria-disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-indigo-mid inline-flex shrink-0">
          {icon}
        </span>
        {children}
      </button>
    </li>
  );
}

/**
 * The « ⋯ » button of a piece of furniture (card of the house, header of the open furniture) and
 * its menu: rename, change the icon, move up or down, delete. The same sheets and the same
 * deletion dialog as the screen « Meubles et étagères ».
 */
export function FurnitureOptions({
  locationId,
  name,
  onChanged,
  className = '',
  api = placesApi,
}: FurnitureOptionsProps) {
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<Step>('closed');
  const [locations, setLocations] = useState<LocationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A double tap on « Monter » sends the change once. */
  const moving = useRef(false);

  const open = () => {
    setStep('menu');
    setError(null);
    setLocations(null);
    api
      .fetchLocations()
      .then(setLocations)
      .catch(() => setError('Impossible de charger les meubles : vérifiez la connexion.'));
  };
  const close = () => {
    setStep('closed');
    button.current?.focus();
  };

  const sorted = locations ?? [];
  const index = sorted.findIndex((l) => l.id === locationId);
  const current = index >= 0 ? sorted[index]! : null;

  async function move(direction: -1 | 1) {
    const changes = reorder(sorted, index, direction);
    if (changes.length === 0 || moving.current) return;
    moving.current = true;
    try {
      await Promise.all(changes.map((c) => api.updateLocation(c.id, { sortOrder: c.sortOrder })));
    } catch (caught) {
      moving.current = false;
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Pas de connexion : réessayez une fois en ligne.',
      );
      return;
    }
    moving.current = false;
    close();
    onChanged({
      kind: 'moved',
      message: `${name} est maintenant en position ${index + direction + 1} sur ${sorted.length}.`,
    });
  }

  return (
    <>
      <button
        ref={button}
        id={furnitureOptionsId(locationId)}
        type="button"
        aria-label={`Options de ${name}`}
        aria-haspopup="dialog"
        aria-expanded={step !== 'closed'}
        onClick={open}
        className={`tap-target text-indigo inline-flex shrink-0 items-center justify-center transition-[opacity,transform] duration-100 active:opacity-50 active:scale-[0.92] motion-reduce:active:scale-100 ${className}`}
      >
        <Ellipsis size={22} aria-hidden="true" />
      </button>

      {step === 'menu' ? (
        <BottomSheet labelledBy={titleId} onClose={close}>
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="text-card-title min-w-0 truncate">
              {name}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="tap-target text-indigo -mr-2 inline-flex items-center justify-center transition-[opacity,transform] duration-100 active:opacity-50 active:scale-[0.92] motion-reduce:active:scale-100"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          {error ? (
            <Callout role="alert" title="Un instant">
              {error}
            </Callout>
          ) : null}
          {current ? (
            <ul className="flex flex-col gap-1">
              <MenuItem icon={<Pencil size={20} />} onClick={() => setStep('rename')}>
                Renommer
              </MenuItem>
              <MenuItem icon={<ImageIcon size={20} />} onClick={() => setStep('icon')}>
                Changer l’icône
              </MenuItem>
              <MenuItem
                icon={<ArrowUp size={20} />}
                disabled={index === 0}
                onClick={() => void move(-1)}
              >
                Monter
              </MenuItem>
              <MenuItem
                icon={<ArrowDown size={20} />}
                disabled={index === sorted.length - 1}
                onClick={() => void move(1)}
              >
                Descendre
              </MenuItem>
              <li aria-hidden="true" className="border-line my-1 border-t" />
              <MenuItem icon={<Trash2 size={20} />} onClick={() => setStep('delete')}>
                Supprimer
              </MenuItem>
            </ul>
          ) : error ? null : (
            <p role="status" className="text-small">
              Chargement…
            </p>
          )}
        </BottomSheet>
      ) : null}

      {step === 'rename' && current ? (
        <RenameFurnitureSheet
          name={current.name}
          otherNames={sorted.filter((l) => l.id !== locationId).map((l) => l.name)}
          rename={(next) => api.updateLocation(locationId, { name: next })}
          onClose={close}
          onRenamed={(next) => {
            close();
            onChanged({ kind: 'renamed', message: `Meuble renommé : ${next}.` });
          }}
        />
      ) : null}

      {step === 'icon' && current ? (
        <IconPickerSheet
          name={current.name}
          icon={current.icon}
          save={(icon) => api.updateLocation(locationId, { icon })}
          onClose={close}
          onSaved={() => {
            close();
            onChanged({ kind: 'icon', message: `Icône de ${current.name} changée.` });
          }}
        />
      ) : null}

      {step === 'delete' && current ? (
        <DeleteFurnitureDialog
          location={current}
          locations={sorted}
          remove={api.deleteLocation}
          onClose={close}
          onDeleted={(message) => {
            setStep('closed');
            onChanged({ kind: 'deleted', message });
          }}
        />
      ) : null}
    </>
  );
}
