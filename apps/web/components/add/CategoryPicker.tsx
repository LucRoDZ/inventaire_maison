'use client';

import type { CategoryDto } from '@inventaire/shared';
import { useId } from 'react';
import { categoryIcon } from '../ui/CategoryIcon';

interface CategoryPickerProps {
  categories: CategoryDto[];
  value: number;
  /** The category suggested by Open Food Facts, tagged « Proposée »; null once a person confirmed one. */
  proposedId: number | null;
  onChange: (categoryId: number) => void;
  disabled?: boolean;
}

/**
 * Every category at a glance (icon and name, two per row), instead of a closed menu: the proposed
 * one is selected and tagged, another one is a single tap away. Native radio buttons, so arrow keys
 * and screen readers work without extra code.
 */
export function CategoryPicker({
  categories,
  value,
  proposedId,
  onChange,
  disabled = false,
}: CategoryPickerProps) {
  const name = useId();
  const labelId = `${name}-label`;
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend id={labelId} className="text-label mb-1">
        {proposedId === null ? 'Catégorie' : 'Catégorie proposée'}
      </legend>
      {proposedId !== null ? (
        <p className="text-small">
          D’après Open Food Facts. Touchez une autre catégorie pour la changer.
        </p>
      ) : null}
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          return (
            <label key={category.id} className="relative flex">
              <input
                type="radio"
                name={name}
                value={category.id}
                checked={category.id === value}
                onChange={() => onChange(category.id)}
                className="peer sr-only"
              />
              <span className="tap-target bg-lavender text-indigo peer-checked:bg-indigo flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                <Icon size={20} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 text-left leading-tight [font:var(--text-small)]">
                  {category.name}
                  {category.id === proposedId ? (
                    <span className="block font-bold uppercase tracking-wide">Proposée</span>
                  ) : null}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
