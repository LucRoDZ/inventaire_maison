'use client';

import type { CategoryDto } from '@inventaire/shared';
import { Suspense, useEffect, useState } from 'react';
import { FilterReminder, FiltersControl } from '../../../components/home/FiltersControl';
import { HomeView } from '../../../components/home/HomeView';
import { SearchField } from '../../../components/home/SearchField';
import { ListView, type ListSummary } from '../../../components/list/ListView';
import { ViewToggle } from '../../../components/list/ViewToggle';
import { Screen } from '../../../components/ui/Screen';
import {
  clearPanelFilters,
  filterSummary,
  useHomeFilters,
  useInventoryView,
  withKnownFilters,
} from '../../../lib/home-filters';
import { fetchCategories } from '../../../lib/stock-api';

/**
 * The inventory. A fixed header, the same in both views: the title and the « Filtres » button, the
 * Maison / Liste switch, the search. Every filter is in the panel of the button; a reminder line
 * says which ones are on. The search and the filters live in the URL.
 */
function Inventaire() {
  const [view, setView] = useInventoryView();
  const [urlFilters, setFilters] = useHomeFilters();
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [summary, setSummary] = useState<ListSummary | null>(null);
  // Ids that no longer exist are ignored, so the badge and the reminder always agree.
  const filters = withKnownFilters(urlFilters, categories, summary?.locations ?? null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  const reminder = filterSummary(filters, view, categories ?? [], summary?.locations ?? []);

  return (
    <Screen
      title="Inventaire"
      actions={
        <FiltersControl
          mode={view}
          filters={filters}
          onChange={setFilters}
          categories={categories ?? []}
          locations={summary?.locations ?? []}
          total={summary?.total ?? 0}
        />
      }
      header={
        <>
          <ViewToggle value={view} onChange={setView} />
          <SearchField value={filters.q} onChange={(q) => setFilters({ ...filters, q })} />
        </>
      }
      zoneLabel={view === 'list' ? 'Liste des produits' : 'Liste des meubles'}
      memoryKey={`inventaire-${view}`}
    >
      {/* In the zone that scrolls: its coming and going never moves the zone itself. */}
      <FilterReminder
        summary={reminder}
        onClear={() => setFilters(clearPanelFilters(filters, view))}
      />
      {view === 'list' ? <ListView filters={filters} onSummary={setSummary} /> : <HomeView />}
    </Screen>
  );
}

export default function InventairePage() {
  return (
    <Suspense>
      <Inventaire />
    </Suspense>
  );
}
