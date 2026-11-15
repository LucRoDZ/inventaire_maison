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
      className={`text-card-title flex-1 rounded-xl px-2 py-3 text-center ${
        isOver ? 'bg-amber text-indigo' : 'bg-white text-indigo'
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
      <ul className="mx-auto flex max-w-xl gap-2">
        {locations.map((location) => (
          <Target key={location.id} id={location.id} name={location.name} />
        ))}
      </ul>
    </nav>
  );
}
