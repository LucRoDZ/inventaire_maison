'use client';

import { useDroppable } from '@dnd-kit/core';
import { furnitureDropId } from '../../../lib/drop';

interface FurnitureDropBarProps {
  locations: { id: number; name: string }[];
}

function Target({ id, name }: { id: number; name: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: furnitureDropId(id) });
  return (
    <li
      ref={setNodeRef}
      className={`text-card-title min-h-11 min-w-0 flex-1 truncate rounded-xl px-2 py-2.5 text-center ${
        isOver ? 'bg-amber text-on-amber' : 'bg-white text-indigo'
      }`}
    >
      {name}
    </li>
  );
}

/** Visible at the top while a tile is dragged: dropping on a furniture sends it to its « Non rangé » tray. */
export function FurnitureDropBar({ locations }: FurnitureDropBarProps) {
  return (
    <nav
      aria-label="Déposer dans un meuble"
      className="bg-indigo fixed inset-x-0 top-0 z-50 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2"
    >
      {/* Up to 4 in a row; more furniture wraps in rows of 3, every target stays visible. */}
      <ul
        className={`mx-auto max-w-xl gap-2 ${locations.length > 4 ? 'grid grid-cols-3' : 'flex'}`}
      >
        {locations.map((location) => (
          <Target key={location.id} id={location.id} name={location.name} />
        ))}
      </ul>
    </nav>
  );
}
