'use client';

import type { ReactNode } from 'react';

interface SelectableRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Product name: the accessible name of the checkbox. */
  name: string;
  /** Second line (brand, quantity…). */
  detail?: ReactNode;
  /** Right side (« 2 en stock »). */
  meta?: ReactNode;
  imageUrl?: string | null;
  /** Shown but not selectable (the detail says why). */
  disabled?: boolean;
  /** Under the row, outside its label (e.g. a quantity stepper once checked). */
  extra?: ReactNode;
}

/** A row of a selection list: the whole row is the label of a native 44 px checkbox. */
export function SelectableRow({
  checked,
  onChange,
  name,
  detail,
  meta,
  imageUrl,
  disabled = false,
  extra,
}: SelectableRowProps) {
  return (
    <div className="border-line border-b last:border-b-0">
      <label
        className={`flex min-h-14 items-center ${disabled ? 'text-grey' : 'cursor-pointer'} gap-3 px-3 py-2`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={name}
          className="tap-target accent-indigo size-11 shrink-0"
        />
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="bg-lavender text-indigo flex size-10 shrink-0 items-center justify-center rounded-lg font-bold"
          >
            {name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 break-words">{name}</span>
          {detail ? <span className="text-small truncate">{detail}</span> : null}
        </span>
        {meta ? <span className="text-small shrink-0">{meta}</span> : null}
      </label>
      {extra ? <div className="flex justify-end px-3 pb-2">{extra}</div> : null}
    </div>
  );
}
