import type { HomeShelfDto, HomeTileDto } from '@inventaire/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { shelfDropId } from '../../lib/drop';
import { DraggableTile } from './dnd/DraggableTile';
import { DroppableShelf } from './dnd/DroppableShelf';

interface ShelfRowProps {
  locationId: number;
  shelf: HomeShelfDto;
  onSelect?: (tile: HomeTileDto) => void;
}

/** Where the scanner opens from: the furniture and the shelf are chosen in advance. */
export const scanHref = (locationId: number, shelfId?: number): string =>
  `/?lieu=${locationId}${shelfId ? `&etagere=${shelfId}` : ''}`;

/** One shelf: tiles on a board (`rack` shows posts, `plain` a flat board); empty: dotted outline. */
export function ShelfRow({ locationId, shelf, onSelect }: ShelfRowProps) {
  return (
    <DroppableShelf id={shelfDropId(locationId, shelf.id)}>
      <section aria-label={shelf.name} className="flex flex-col gap-1">
        <h3 className="text-label">{shelf.name}</h3>
        {shelf.tiles.length === 0 ? (
          <div className="border-lavender-line flex min-h-20 items-center justify-between rounded-xl border-2 border-dashed px-4">
            <span className="text-small">Vide</span>
            <Link
              href={scanHref(locationId, shelf.id)}
              aria-label={`Ajouter un produit sur ${shelf.name}`}
              className="tap-target bg-amber text-indigo inline-flex items-center justify-center rounded-full"
            >
              <Plus size={20} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {shelf.tiles.map((tile) => (
              <li key={tile.stockItemId} className="shrink-0">
                <DraggableTile tile={tile} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
        <div aria-hidden="true" data-shelf-kind={shelf.kind}>
          <div className="bg-indigo h-2 rounded-full" />
          {shelf.kind === 'rack' ? (
            <div className="flex justify-between px-3">
              {[0, 1, 2, 3].map((post) => (
                <span key={post} className="bg-indigo h-2 w-1.5" />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </DroppableShelf>
  );
}
