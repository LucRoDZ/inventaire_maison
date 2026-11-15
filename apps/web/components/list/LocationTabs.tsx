import type { LocationCountDto, LocationDto } from '@inventaire/shared';

interface LocationTabsProps {
  locations: LocationDto[];
  counts: LocationCountDto[];
  /** Null: « Tout ». */
  value: number | null;
  onChange: (locationId: number | null) => void;
}

/** « Tout » then one tab per location, each with its number of products. */
export function LocationTabs({ locations, counts, value, onChange }: LocationTabsProps) {
  const total = counts.reduce((sum, count) => sum + count.products, 0);
  const tabs: { id: number | null; label: string; count: number }[] = [
    { id: null, label: 'Tout', count: total },
    ...locations.map((location) => ({
      id: location.id,
      label: location.name,
      count: counts.find((c) => c.locationId === location.id)?.products ?? 0,
    })),
  ];
  return (
    <div role="tablist" aria-label="Lieux" className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id ?? 'all'}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`tap-target shrink-0 rounded-full px-4 font-bold ${
              selected ? 'bg-indigo text-white' : 'bg-lavender text-indigo'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        );
      })}
    </div>
  );
}
