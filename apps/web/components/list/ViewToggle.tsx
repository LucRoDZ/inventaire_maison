import type { InventoryView } from '../../lib/home-filters';

export type { InventoryView };

interface ViewToggleProps {
  value: InventoryView;
  onChange: (view: InventoryView) => void;
}

/** Maison / Liste: a segmented control whose thumb slides (transform only) under the labels. */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Affichage"
      className="bg-fill-quiet relative flex rounded-[10px] p-0.5"
    >
      <span
        aria-hidden="true"
        data-testid="view-toggle-thumb"
        className={`shadow-raised ease-out-soft pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-white transition-transform duration-[var(--dur-slide)] motion-reduce:transition-none ${
          value === 'list' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
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
          className={`tap-target relative z-10 flex-1 rounded-lg ${
            value === view ? 'text-ink font-semibold' : 'text-grey'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
