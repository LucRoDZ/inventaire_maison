import type { HomeShelfDto, HomeTileDto } from '@inventaire/shared';
import { Maximize2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { shelfDropId } from '../../lib/drop';
import { focusHref, nameReturnShelf, openFocus } from '../../lib/shelf-focus';
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
  /** `?q=…`: the furniture filters follow into the focus page. */
  focusQuery?: string;
}

/** « Ouvrir l’étagère 1 », « Ouvrir Bac à légumes »: the name as the person wrote it. */
export const openLabel = (name: string): string =>
  /^étagère/i.test(name)
    ? `Ouvrir l’${name.charAt(0).toLowerCase()}${name.slice(1)}`
    : `Ouvrir ${name}`;

/** Glyph-only link to the focus page: a 44 px box centred on the 12 px line, which clips it
 * vertically (`overflow-y-clip`): it never covers the tiles nor makes the last shelf scroll. */
export function FocusLink({
  locationId,
  shelfId,
  label,
  query,
}: {
  locationId: number;
  shelfId: number | null;
  label: string;
  query?: string;
}) {
  return (
    <Link
      href={focusHref(locationId, shelfId, query)}
      aria-label={label}
      onClick={(event) => openFocus(event, shelfId)}
      className="text-indigo-mid relative -my-4 -mr-2 -ml-1 inline-flex size-11 shrink-0 items-center justify-center"
    >
      <Maximize2 size={14} aria-hidden="true" />
    </Link>
  );
}

/** Where the scanner opens from: the furniture and the shelf are chosen in advance. */
export const scanHref = (locationId: number, shelfId?: number): string =>
  `/scanner?lieu=${locationId}${shelfId ? `&etagere=${shelfId}` : ''}`;

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
  focusQuery,
}: ShelfRowProps) {
  const section = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (section.current) nameReturnShelf(section.current, shelf.id);
  }, [shelf.id]);
  const drawer = look === 'drawer';
  const empty = shelf.tiles.length === 0;
  const articles = new Set(shelf.tiles.map((tile) => tile.productId)).size;

  return (
    <DroppableShelf id={shelfDropId(locationId, shelf.id)} className="fx-row">
      <section
        ref={section}
        data-shelf-key={shelf.id}
        aria-label={shelf.name}
        className={`fx-shelf ${drawer ? 'fx-drawer' : ''}`}
        data-shelf-kind={drawer ? shelf.kind : undefined}
        style={drawer ? ({ '--i': index } as CSSProperties) : undefined}
      >
        <div className={`fx-zone z-[1] ${empty ? 'fx-zone-empty' : ''}`}>
          {empty ? (
            <>
              <span className="text-help">Vide</span>
              <Link
                href={scanHref(locationId, shelf.id)}
                aria-label={`Ajouter un produit sur ${shelf.name}`}
                className="fx-plus tap-target text-indigo inline-flex items-center justify-center"
              >
                <span className="border-line inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white">
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
        <div className="fx-line flex items-center gap-2 overflow-y-clip">
          <h3 className="text-help text-indigo-mid fx-shelf-name font-semibold min-w-0 truncate">
            {shelf.name}
          </h3>
          <FocusLink
            locationId={locationId}
            shelfId={shelf.id}
            label={openLabel(shelf.name)}
            query={focusQuery}
          />
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
