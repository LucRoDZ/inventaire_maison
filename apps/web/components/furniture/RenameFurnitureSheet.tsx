'use client';

import { PLACE_NAME_MAX_LENGTH } from '@inventaire/shared';
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { furnitureNameError } from '../../lib/furniture-edit';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

interface RenameFurnitureSheetProps {
  name: string;
  /** Names of the other pieces of furniture of the house. */
  otherNames: string[];
  rename: (name: string) => Promise<unknown>;
  onRenamed: (name: string) => void;
  onClose: () => void;
}

const field = 'tap-target border-line rounded-xl border bg-white px-3 text-base text-ink w-full';

/**
 * Renames a piece of furniture: the field comes filled and selected, its label is visible, the
 * reason of a refusal shows under it, Entrée confirms. Closed, the focus goes back to the button
 * that opened it (the sheet gives it back).
 */
export function RenameFurnitureSheet({
  name,
  otherNames,
  rename,
  onRenamed,
  onClose,
}: RenameFurnitureSheetProps) {
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Selected at once: typing replaces the old name.
  useLayoutEffect(() => {
    input.current?.select();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const problem = furnitureNameError(value, otherNames);
    if (problem) {
      setError(problem);
      input.current?.focus();
      return;
    }
    const trimmed = value.trim();
    if (trimmed === name) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await rename(trimmed);
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.status === 409) {
        setError('Un meuble porte déjà ce nom : choisissez-en un autre.');
        input.current?.focus();
      } else {
        setFormError(
          caught instanceof ApiError && caught.status !== 0
            ? caught.message
            : 'Pas de connexion : réessayez une fois en ligne.',
        );
      }
      return;
    }
    onRenamed(trimmed);
  }

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose} initialFocus={input} layer="top">
      <h2 id={titleId} className="text-card-title">
        Renommer {name}
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId} className="text-label">
            Nom du meuble
          </label>
          <input
            ref={input}
            id={fieldId}
            className={`${field} ${error ? 'border-alert' : ''}`}
            value={value}
            // One more than allowed, so that a pasted name too long is said, not cut silently.
            maxLength={PLACE_NAME_MAX_LENGTH + 1}
            enterKeyHint="done"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
          {error ? (
            <p id={errorId} role="alert" className="text-small text-alert">
              {error}
            </p>
          ) : null}
        </div>
        {formError ? (
          <Callout role="alert" title="Nom non enregistré">
            {formError}
          </Callout>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button type="submit" aria-disabled={busy}>
            {busy ? 'Enregistrement…' : 'Renommer'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
