'use client';

import { CATEGORY_ICONS, type CategoryIcon } from '@inventaire/shared';
import { categoryIcon } from '../ui/CategoryIcon';
import { iconLabel } from '../ui/icon-labels';

/** Closed list of Lucide icons, as a group of toggle buttons. */
export function IconPicker({
  value,
  onChange,
  label = 'Icône',
}: {
  value: CategoryIcon;
  onChange: (icon: CategoryIcon) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {CATEGORY_ICONS.map((name) => {
        const Icon = categoryIcon(name);
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconLabel(name)}
            onClick={() => onChange(name)}
            className={`tap-target flex w-11 items-center justify-center rounded-xl ${
              selected ? 'text-indigo ring-indigo ring-[1.5px] ring-inset' : 'text-ink'
            }`}
          >
            <Icon size={20} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
