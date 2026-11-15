import type { HomeTileDto } from '@inventaire/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { scanHref } from './ShelfRow';
import { trayDropId } from '../../lib/drop';
import { DraggableTile } from './dnd/DraggableTile';
import { DroppableShelf } from './dnd/DroppableShelf';

interface UnshelvedTrayProps {
  locationId: number;
  tiles: HomeTileDto[];
  onSelect?: (tile: HomeTileDto) => void;
}

/** « Non rangé »: what is in the piece of furniture without a shelf. */
export function UnshelvedTray({ locationId, tiles, onSelect }: UnshelvedTrayProps) {
  return (
    <DroppableShelf id={trayDropId(locationId)}>
      <section aria-label="Non rangé" className="bg-lavender rounded-card flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-label">Non rangé</h3>
          <Link
            href={scanHref(locationId)}
            aria-label="Ajouter un produit non rangé"
            className="tap-target bg-amber text-indigo inline-flex items-center justify-center rounded-full"
          >
            <Plus size={20} aria-hidden="true" />
          </Link>
        </div>
        {tiles.length === 0 ? (
          <p className="text-small">Rien de non rangé.</p>
        ) : (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {tiles.map((tile) => (
              <li key={tile.stockItemId} className="shrink-0">
                <DraggableTile tile={tile} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </DroppableShelf>
  );
}
