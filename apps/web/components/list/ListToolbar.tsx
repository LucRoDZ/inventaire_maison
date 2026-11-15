import { STOCK_SORTS, type CategoryDto, type StockSort } from '@inventaire/shared';
import { Search } from 'lucide-react';

export const SORT_LABELS: Record<StockSort, string> = {
  name: 'Nom',
  added: 'Date d’ajout',
  expiry: 'Date limite',
};

interface ListToolbarProps {
  query: string;
  onQuery: (query: string) => void;
  categories: CategoryDto[];
  category: number | null;
  onCategory: (category: number | null) => void;
  sort: StockSort;
  onSort: (sort: StockSort) => void;
}

const select = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3';

export function ListToolbar({
  query,
  onQuery,
  categories,
  category,
  onCategory,
  sort,
  onSort,
}: ListToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Rechercher un produit</span>
        <Search
          size={18}
          aria-hidden="true"
          className="text-indigo-mid absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Nom ou marque"
          className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-label flex flex-col gap-1">
          Catégorie
          <select
            className={select}
            value={category ?? ''}
            onChange={(event) =>
              onCategory(event.target.value === '' ? null : Number(event.target.value))
            }
          >
            <option value="">Toutes</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-label flex flex-col gap-1">
          Tri
          <select
            className={select}
            value={sort}
            onChange={(event) => onSort(event.target.value as StockSort)}
          >
            {STOCK_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
