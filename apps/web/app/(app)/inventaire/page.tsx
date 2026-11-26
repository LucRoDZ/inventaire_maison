'use client';

import type { CategoryDto } from '@inventaire/shared';
import { Suspense, useEffect, useState } from 'react';
import { FilterReminder, FiltersControl } from '../../../components/home/FiltersControl';
import { SummaryCounters } from '../../../components/home/SummaryCounters';
import { HomeView } from '../../../components/home/HomeView';
import { SearchField } from '../../../components/home/SearchField';
import { ListView, type ListSummary } from '../../../components/list/ListView';
import { ViewToggle } from '../../../components/list/ViewToggle';
import { AddFab } from '../../../components/add/AddFab';
import { Screen } from '../../../components/ui/Screen';
import {
  clearPanelFilters,
  filterSummary,
  useHomeFilters,
  useInventoryView,
  withKnownFilters,
} from '../../../lib/home-filters';
import { PendingSyncBadge } from '../../../lib/offline';
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
  const [stockVersion, setStockVersion] = useState(0);
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
        <>
          <PendingSyncBadge className="mr-3" />
          <FiltersControl
            mode={view}
            filters={filters}
            onChange={setFilters}
            categories={categories ?? []}
            locations={summary?.locations ?? []}
            total={summary?.total ?? 0}
          />
        </>
      }
      header={
        <>
          <ViewToggle value={view} onChange={setView} />
          <SearchField
            value={filters.q} // From the URL itself: typing never erases a filter only hidden for now.
            onChange={(q) => setFilters({ ...urlFilters, q })}
          />
        </>
      }
      zoneLabel={view === 'list' ? 'Liste des produits' : 'Liste des meubles'}
      memoryKey={`inventaire-${view}`}
      floatingAction
    >
      <SummaryCounters
        active={filters.expiry}
        onSelect={(expiry) => setFilters({ ...urlFilters, expiry })}
        version={stockVersion}
      />
      {/* In the zone that scrolls: its coming and going never moves the zone itself. */}
      <FilterReminder
        summary={reminder}
        onClear={() => setFilters(clearPanelFilters(filters, view))}
      />
      {view === 'list' ? (
        <ListView
          filters={filters}
          onSummary={setSummary}
          onStockChanged={() => setStockVersion((v) => v + 1)}
        />
      ) : (
        <HomeView />
      )}
      <AddFab />
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
