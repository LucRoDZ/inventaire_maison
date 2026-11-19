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
 * One shelf, the same structure empty or full, and the same height as every other shelf of its
 * furniture (furniture.css). Top: the tiles, scrolling sideways; empty: « Vide » centred and a +
 * that opens the scanner on this shelf (a dotted outline around that zone, never in a drawer).
 * Bottom: the name, then the board on its right; a drawer has no board but its number of
 * articles on the right, nothing when empty.
 */
export function ShelfRow({
  locationId,
  shelf,
  onSelect,
  isDimmed,
  look = 'board',
  index = 0,
}: ShelfRowProps) {
  const drawer = look === 'drawer';
  const empty = shelf.tiles.length === 0;
  const articles = new Set(shelf.tiles.map((tile) => tile.productId)).size;

  return (
    <DroppableShelf id={shelfDropId(locationId, shelf.id)} className="fx-row">
      <section
        aria-label={shelf.name}
        className={`fx-shelf ${drawer ? 'fx-drawer' : ''}`}
        data-shelf-kind={drawer ? shelf.kind : undefined}
        style={drawer ? ({ '--i': index } as CSSProperties) : undefined}
      >
        <div className={`fx-zone ${empty ? 'fx-zone-empty' : ''}`}>
          {empty ? (
            <>
              <span className="text-help">Vide</span>
              <Link
                href={scanHref(locationId, shelf.id)}
                aria-label={`Ajouter un produit sur ${shelf.name}`}
                className="fx-plus tap-target text-indigo inline-flex items-center justify-center"
              >
                <span className="bg-amber inline-flex h-7 w-7 items-center justify-center rounded-full">
                  <Plus size={18} aria-hidden="true" />
                </span>
              </Link>
            </>
          ) : (
            <ul className="fx-tiles flex overflow-x-auto">
              {shelf.tiles.map((tile) => (
                <li key={tile.stockItemId} className="shrink-0">
                  <DraggableTile tile={tile} onSelect={onSelect} dimmed={isDimmed?.(tile)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fx-line flex items-center gap-2">
          <h3 className="text-label fx-shelf-name min-w-0 truncate">{shelf.name}</h3>
          {drawer ? (
            articles > 0 ? (
              <span className="fx-count text-help ml-auto shrink-0">
                {articles} {articles > 1 ? 'articles' : 'article'}
              </span>
            ) : null
          ) : (
            <Board look={look} kind={shelf.kind} />
          )}
        </div>
      </section>
    </DroppableShelf>
  );
}
