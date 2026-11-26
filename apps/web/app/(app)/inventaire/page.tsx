'use client';

import type { CategoryDto } from '@inventaire/shared';
import { Suspense, useEffect, useState } from 'react';
import { FilterReminder, FiltersControl } from '../../../components/home/FiltersControl';
import { HomeView } from '../../../components/home/HomeView';
import { SearchField } from '../../../components/home/SearchField';
import { ListView, type ListSummary } from '../../../components/list/ListView';
import { ViewToggle } from '../../../components/list/ViewToggle';
import {
  clearPanelFilters,
  filterSummary,
  useHomeFilters,
  useInventoryView,
} from '../../../lib/home-filters';
import { fetchCategories } from '../../../lib/stock-api';

/**
 * The inventory. A fixed header, the same in both views: the title and the « Filtres » button, the
 * Maison / Liste switch, the search. Every filter is in the panel of the button; a reminder line
 * says which ones are on. The search and the filters live in the URL.
 */
function Inventaire() {
  const [view, setView] = useInventoryView();
  const [filters, setFilters] = useHomeFilters();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [summary, setSummary] = useState<ListSummary>({ locations: [], total: 0 });

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  const reminder = filterSummary(filters, view, categories, summary.locations);

  return (
    <main className="flex flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-2">
        <div className="flex h-11 items-center justify-between gap-2">
          <h1 className="text-title">Inventaire</h1>
          <FiltersControl
            mode={view}
            filters={filters}
            onChange={setFilters}
            categories={categories}
            locations={summary.locations}
            total={summary.total}
          />
        </div>
        <ViewToggle value={view} onChange={setView} />
        <SearchField value={filters.q} onChange={(q) => setFilters({ ...filters, q })} />
      </header>
      <div className="flex flex-col gap-3">
        <FilterReminder
          summary={reminder}
          onClear={() => setFilters(clearPanelFilters(filters, view))}
        />
        {view === 'list' ? <ListView filters={filters} onSummary={setSummary} /> : <HomeView />}
      </div>
    </main>
  );
}

export default function InventairePage() {
  return (
    <Suspense>
      <Inventaire />
    </Suspense>
  );
}
