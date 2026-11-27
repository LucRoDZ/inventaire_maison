'use client';

import { Button } from '../ui/Button';

interface BatchBarProps {
  count: number;
  busy: boolean;
  onMove: () => void;
  onConsumed: () => void;
  onWasted: () => void;
  onDone: () => void;
}

/**
 * Actions on the lines ticked in the list: move them, or take them out of the stock (all their
 * units) as eaten or thrown away. Sticks to the bottom of the scroll zone, above the bottom bar.
 */
export function BatchBar({ count, busy, onMove, onConsumed, onWasted, onDone }: BatchBarProps) {
  const none = count === 0 || busy;
  return (
    <div
      role="region"
      aria-label="Actions sur la sélection"
      className="border-line rounded-card shadow-raised sticky bottom-0 z-10 flex flex-col gap-2 border bg-white p-3"
    >
      <p role="status" className="text-small">
        {count === 0
          ? 'Cochez des produits.'
          : `${count} ${count > 1 ? 'produits sélectionnés' : 'produit sélectionné'}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" disabled={none} onClick={onMove}>
          Déplacer vers…
        </Button>
        <Button variant="outline" disabled={none} onClick={onConsumed}>
          Consommé
        </Button>
        <Button variant="outline" disabled={none} onClick={onWasted}>
          Jeté
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Terminer
        </Button>
      </div>
    </div>
  );
}
