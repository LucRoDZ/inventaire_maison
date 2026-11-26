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
 * « Non rangé »: what is in the piece of furniture without a shelf. A white tray in the body:
 * empty, a thin line of 56 px; with products, exactly the height of a shelf, never more. It
 * stays a drop target either way.
 */
export function UnshelvedTray({ locationId, tiles, onSelect, isDimmed }: UnshelvedTrayProps) {
  const empty = tiles.length === 0;
  const add = (
    <Link
      href={scanHref(locationId)}
      aria-label="Ajouter un produit non rangé"
      className="fx-plus tap-target text-indigo inline-flex shrink-0 items-center justify-center"
    >
      <span className="border-line inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white">
        <Plus size={18} aria-hidden="true" />
      </span>
    </Link>
  );
  const name = (
    <h3 className="text-help text-indigo-mid fx-shelf-name font-semibold shrink-0">Non rangé</h3>
  );
  return (
    <DroppableShelf
      id={trayDropId(locationId)}
      className={`fx-tray-row ${empty ? 'fx-tray-empty' : ''}`}
    >
      <section aria-label="Non rangé" className="fx-tray bg-white">
        {empty ? (
          <div className="flex h-full items-center gap-2">
            {name}
            <p className="text-help min-w-0 flex-1 truncate">Rien de non rangé.</p>
            {add}
          </div>
        ) : (
          <>
            <div className="fx-zone">
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
          </>
        )}
      </section>
    </DroppableShelf>
  );
}
