'use client';

import { useState } from 'react';
import { HomeView } from '../../../components/home/HomeView';
import { ListView } from '../../../components/list/ListView';
import { ViewToggle, type InventoryView } from '../../../components/list/ViewToggle';

export default function InventairePage() {
  const [view, setView] = useState<InventoryView>('home');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">Inventaire</h1>
      <ViewToggle value={view} onChange={setView} />
      {view === 'list' ? <ListView /> : <HomeView />}
    </main>
  );
}
