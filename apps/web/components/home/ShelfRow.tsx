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

/** One shelf: tiles on a board (`rack` shows posts, `plain` a flat board); empty: dotted outline. */
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
  const articles = new Set(shelf.tiles.map((tile) => tile.productId)).size;
  return (
    <DroppableShelf id={shelfDropId(locationId, shelf.id)}>
      <section
        aria-label={shelf.name}
        className={`flex flex-col gap-1 ${drawer ? 'fx-drawer' : ''} ${spot ? 'relative isolate pt-2' : ''}`}
        style={drawer ? ({ '--i': index } as CSSProperties) : undefined}
      >
        {spot ? <span className="fx-spot" aria-hidden="true" /> : null}
        {drawer ? (
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-label">{shelf.name}</h3>
            <span className="text-help">
              {articles} {articles > 1 ? 'articles' : 'article'}
            </span>
          </div>
        ) : (
          <h3 className="text-label">{shelf.name}</h3>
        )}
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
          <ul className="flex overflow-x-auto pb-1">
            {shelf.tiles.map((tile) => (
              <li key={tile.stockItemId} className="shrink-0">
                <DraggableTile tile={tile} onSelect={onSelect} dimmed={isDimmed?.(tile)} />
              </li>
            ))}
          </ul>
        )}
        <div aria-hidden="true" data-shelf-kind={shelf.kind}>
          <div className={look === 'board' ? 'bg-indigo h-2 rounded-full' : 'fx-glass-edge'} />
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
