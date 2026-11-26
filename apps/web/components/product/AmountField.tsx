'use client';

import { QUANTITY_UNITS, QUANTITY_UNIT_LABELS, type QuantityUnit } from '@inventaire/shared';
import { useId } from 'react';

export interface AmountValue {
  /** The text typed ("226,8"): read with `parseAmount`. */
  amount: string;
  unit: QuantityUnit | '';
}

/** Reads « 226,8 » or « 226.8 »: a positive number, or null when empty or unreadable. */
export function parseAmount(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

/** The error to show under the field, or null: an amount needs a unit and the other way round. */
export function amountError(value: AmountValue): string | null {
  const hasText = value.amount.trim() !== '';
  if (hasText && parseAmount(value.amount) === null) return 'Entrez un nombre supérieur à 0.';
  if (hasText && value.unit === '') return 'Choisissez une unité.';
  if (!hasText && value.unit !== '') return 'Entrez la quantité.';
  return null;
}

/** `{ amount, unit }` ready for the API (both null when empty). */
export const amountPayload = (
  value: AmountValue,
): { amount: number | null; unit: QuantityUnit | null } =>
  value.unit === ''
    ? { amount: null, unit: null }
    : { amount: parseAmount(value.amount), unit: value.unit };

export const amountFrom = (
  product: { amount: number | null; unit: QuantityUnit | null } | null,
): AmountValue => ({
  amount: product?.amount != null ? String(product.amount).replace('.', ',') : '',
  unit: product?.unit ?? '',
});

const field = 'tap-target border-line text-ink rounded-xl border bg-white px-3 text-base';

interface AmountFieldProps {
  value: AmountValue;
  onChange: (value: AmountValue) => void;
  error?: string | null;
  label?: string;
}

/** Net content of one unit: « 500 » and « g ». */
export function AmountField({
  value,
  onChange,
  error = null,
  label = 'Contenance (facultative)',
}: AmountFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <span id={`${id}-label`} className="text-label">
        {label}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex gap-2">
        <input
          aria-label="Quantité nette"
          inputMode="decimal"
          value={value.amount}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          className={`${field} min-w-0 flex-1`}
        />
        <select
          aria-label="Unité"
          value={value.unit}
          onChange={(event) =>
            onChange({ ...value, unit: event.target.value as QuantityUnit | '' })
          }
          aria-invalid={error !== null}
          className={`${field} w-28`}
        >
          <option value="">Unité</option>
          {QUANTITY_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {QUANTITY_UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-small text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
