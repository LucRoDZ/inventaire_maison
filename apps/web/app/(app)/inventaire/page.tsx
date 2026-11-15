'use client';

import { useState } from 'react';
import { ListView } from '../../../components/list/ListView';
import { ViewToggle, type InventoryView } from '../../../components/list/ViewToggle';

export default function InventairePage() {
  const [view, setView] = useState<InventoryView>('list');
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-title">Inventaire</h1>
      <ViewToggle value={view} onChange={setView} />
      {view === 'list' ? (
        <ListView />
      ) : (
        <p className="text-body">La vue Maison arrive avec la tâche suivante.</p>
      )}
    </main>
  );
}
