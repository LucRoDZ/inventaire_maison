import type { InventoryView } from '../../lib/home-filters';

export type { InventoryView };

interface ViewToggleProps {
  value: InventoryView;
  onChange: (view: InventoryView) => void;
}

/** Maison / Liste. */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div role="group" aria-label="Affichage" className="bg-lavender flex gap-1 rounded-xl p-1">
      {(
        [
          ['home', 'Maison'],
          ['list', 'Liste'],
        ] as const
      ).map(([view, label]) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={`tap-target flex-1 rounded-lg font-semibold ${
            value === view
              ? 'bg-white text-indigo shadow-raised'
              : 'text-indigo-mid hover:text-indigo'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
