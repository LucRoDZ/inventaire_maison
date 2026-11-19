import type { HomeShelfDto, HomeTileDto } from '@inventaire/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { shelfDropId } from '../../lib/drop';
import { DraggableTile } from './dnd/DraggableTile';
import { DroppableShelf } from './dnd/DroppableShelf';

/**
 * How the furniture draws its shelves: an indigo board, a glass one (fridge), or a drawer with a
 * white front and a glass bottom (freezer). A drawer is always open: its content stays visible and
 * it stays a drop target.
 */
export type ShelfLook = 'board' | 'glass' | 'drawer';

interface ShelfRowProps {
  locationId: number;
  shelf: HomeShelfDto;
  onSelect?: (tile: HomeTileDto) => void;
  /** True for a tile that does not pass the current filter. */
  isDimmed?: (tile: HomeTileDto) => boolean;
  /** Decided by the kind of furniture, never by the name of the shelf. */
  look?: ShelfLook;
  /** An amber spot above the shelf (pantry, cellar). */
  spot?: boolean;
  /** Rank of the shelf in its furniture: the drawers slide in one after the other. */
  index?: number;
}

/** Where the scanner opens from: the furniture and the shelf are chosen in advance. */
export const scanHref = (locationId: number, shelfId?: number): string =>
  `/?lieu=${locationId}${shelfId ? `&etagere=${shelfId}` : ''}`;

/** The board under the tiles (`rack` adds posts). Scenery: hidden from assistive technology. */
function Board({ look, kind }: { look: ShelfLook; kind: HomeShelfDto['kind'] }) {
  return (
    <div aria-hidden="true" data-shelf-kind={kind} className="fx-board">
      <div className={look === 'board' ? 'bg-indigo h-2 rounded-full' : 'fx-glass-edge'} />
      {kind === 'rack' ? (
        <div className="fx-posts flex justify-between px-3">
          {[0, 1, 2, 3].map((post) => (
            <span key={post} className="bg-indigo h-2 w-1.5" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One shelf. Filled: its tiles above a line holding its name and its board; the row takes its share
 * of the height of the furniture and the tiles grow or shrink with it. Empty: a thin dotted row
 * with « Vide » and a + that opens the scanner on this shelf.
 */
export function ShelfRow({
  locationId,
  shelf,
  onSelect,
  isDimmed,
  look = 'board',
  spot = false,
  index = 0,
}: ShelfRowProps) {
  const drawer = look === 'drawer';
  const empty = shelf.tiles.length === 0;
  const articles = new Set(shelf.tiles.map((tile) => tile.productId)).size;
  const count = drawer ? (
    <span className="text-help shrink-0">
      {articles} {articles > 1 ? 'articles' : 'article'}
    </span>
  ) : null;
  const name = <h3 className="text-label fx-shelf-name min-w-0 truncate">{shelf.name}</h3>;

  return (
    <DroppableShelf
      id={shelfDropId(locationId, shelf.id)}
      className={empty ? 'fx-row-empty' : 'fx-row'}
    >
      <section
        aria-label={shelf.name}
        className={`relative isolate ${drawer ? 'fx-drawer' : ''}`}
        style={drawer ? ({ '--i': index } as CSSProperties) : undefined}
      >
        {spot ? <span className="fx-spot" aria-hidden="true" /> : null}
        {empty ? (
          <div className="fx-empty border-lavender-line flex items-center gap-2 rounded-xl border-2 border-dashed pr-1 pl-2">
            {name}
            <span className="text-small">Vide</span>
            <span className="ml-auto" />
            {count}
            <Link
              href={scanHref(locationId, shelf.id)}
              aria-label={`Ajouter un produit sur ${shelf.name}`}
              className="fx-plus tap-target text-indigo inline-flex shrink-0 items-center justify-center"
            >
              <span className="bg-amber inline-flex h-7 w-7 items-center justify-center rounded-full">
                <Plus size={18} aria-hidden="true" />
              </span>
            </Link>
          </div>
        ) : (
          <div className="fx-fill">
            <ul className="fx-tiles flex overflow-x-auto">
              {shelf.tiles.map((tile) => (
                <li key={tile.stockItemId} className="shrink-0">
                  <DraggableTile tile={tile} onSelect={onSelect} dimmed={isDimmed?.(tile)} />
                </li>
              ))}
            </ul>
            <div className="fx-line flex items-center gap-2">
              {name}
              <Board look={look} kind={shelf.kind} />
              {count}
            </div>
          </div>
        )}
        {empty ? <Board look={look} kind={shelf.kind} /> : null}
      </section>
    </DroppableShelf>
  );
}
