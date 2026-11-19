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
  /** True for a tile that does not pass the current filter. */
  isDimmed?: (tile: HomeTileDto) => boolean;
}

/**
 * « Non rangé »: what is in the piece of furniture without a shelf. A white tray in the lavender
 * body; filled, it takes its share of the height like a shelf; empty, a thin row that stays a drop
 * target.
 */
export function UnshelvedTray({ locationId, tiles, onSelect, isDimmed }: UnshelvedTrayProps) {
  const empty = tiles.length === 0;
  const add = (
    <Link
      href={scanHref(locationId)}
      aria-label="Ajouter un produit non rangé"
      className="fx-plus tap-target text-indigo inline-flex shrink-0 items-center justify-center"
    >
      <span className="bg-amber inline-flex h-7 w-7 items-center justify-center rounded-full">
        <Plus size={18} aria-hidden="true" />
      </span>
    </Link>
  );
  const name = <h3 className="text-label fx-shelf-name min-w-0 truncate">Non rangé</h3>;
  return (
    <DroppableShelf id={trayDropId(locationId)} className={empty ? 'fx-row-empty' : 'fx-row'}>
      <section aria-label="Non rangé" className="fx-tray bg-white">
        {empty ? (
          <div className="fx-empty flex items-center gap-2 pr-1 pl-2">
            {name}
            <p className="text-small min-w-0 truncate">Rien de non rangé.</p>
            <span className="ml-auto" />
            {add}
          </div>
        ) : (
          <div className="fx-fill">
            <div className="flex min-h-0 flex-1 items-center gap-1">
              <ul className="fx-tiles flex min-w-0 flex-1 overflow-x-auto">
                {tiles.map((tile) => (
                  <li key={tile.stockItemId} className="shrink-0">
                    <DraggableTile tile={tile} onSelect={onSelect} dimmed={isDimmed?.(tile)} />
                  </li>
                ))}
              </ul>
              {add}
            </div>
            <div className="fx-line flex items-center gap-2">{name}</div>
          </div>
        )}
      </section>
    </DroppableShelf>
  );
}
