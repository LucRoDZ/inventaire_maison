import type { CategoryDto } from '@inventaire/shared';
import { Search } from 'lucide-react';
import type { HomeFilters as Filters } from '../../lib/home-filters';

interface HomeFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: CategoryDto[];
}

/** Search box and category chips (lavender): what does not match fades, furniture with a match is ringed. */
export function HomeFilters({ filters, onChange, categories }: HomeFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Rechercher dans la maison</span>
        <Search
          size={18}
          aria-hidden="true"
          className="text-indigo-mid absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="search"
          value={filters.q}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
          placeholder="Nom ou marque"
          className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10"
        />
      </label>
      <div role="group" aria-label="Catégories" className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const selected = filters.categoryId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ ...filters, categoryId: selected ? null : category.id })}
              className={`tap-target shrink-0 rounded-full px-4 font-bold ${
                selected ? 'bg-indigo text-white' : 'bg-lavender text-indigo'
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
