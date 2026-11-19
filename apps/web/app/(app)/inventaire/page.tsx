'use client';

import type { CategoryDto } from '@inventaire/shared';
import { Suspense, useEffect, useState } from 'react';
import { FiltersControl } from '../../../components/home/FiltersControl';
import { HomeView } from '../../../components/home/HomeView';
import { ListView } from '../../../components/list/ListView';
import { ViewToggle, type InventoryView } from '../../../components/list/ViewToggle';
import { useHomeFilters } from '../../../lib/home-filters';
import { fetchCategories } from '../../../lib/stock-api';

/** The same « Filtres » button as in an open furniture, on the filters of the URL. */
function HomeFiltersButton() {
  const [filters, setFilters] = useHomeFilters();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);
  return <FiltersControl filters={filters} onChange={setFilters} categories={categories} />;
}

export default function InventairePage() {
  const [view, setView] = useState<InventoryView>('home');
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-title">Inventaire</h1>
        {view === 'home' ? (
          <Suspense>
            <HomeFiltersButton />
          </Suspense>
        ) : null}
      </div>
      <ViewToggle value={view} onChange={setView} />
      {view === 'list' ? (
        <ListView />
      ) : (
        <Suspense>
          <HomeView />
        </Suspense>
      )}
    </main>
  );
}
