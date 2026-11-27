import type { HomeTileDto } from '@inventaire/shared';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { categoryIcon } from '../ui/CategoryIcon';
import { FadeImage } from '../ui/FadeImage';

interface ProductTileProps {
  tile: HomeTileDto;
  /** Opens the product panel. */
  onSelect?: (tile: HomeTileDto) => void;
  /** Outside the current filter: the tile fades. */
  dimmed?: boolean;
  /** Set by the drag-and-drop wrapper: the button itself is the draggable element. */
  dragRef?: Ref<HTMLButtonElement>;
  dragProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}

/**
 * Square thumbnail (its side follows the height of its shelf, see furniture.css): the photo, or the category glyph on its lavender badge, with an amber quantity
 * badge. A raised card with a thin outline, so that it reads on the lavender inside of a furniture.
 */
export function ProductTile({
  tile,
  onSelect,
  dimmed = false,
  dragRef,
  dragProps,
}: ProductTileProps) {
  const Glyph = categoryIcon(tile.category.icon);
  return (
    <button
      ref={dragRef}
      type="button"
      {...dragProps}
      onClick={() => onSelect?.(tile)}
      aria-label={`${tile.name}, quantité ${tile.quantity}`}
      className={`border-lavender-line fx-tile relative shrink-0 overflow-hidden rounded-xl border bg-surface-raised transition-opacity ${
        dimmed ? 'opacity-30' : ''
      }`}
    >
      {tile.imageUrl ? (
        <FadeImage src={tile.imageUrl} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <span className="fx-tile-badge text-indigo flex items-center justify-center">
            <Glyph size={28} aria-hidden="true" className="fx-tile-glyph" />
          </span>
        </span>
      )}
      <span
        aria-hidden="true"
        className="bg-amber text-on-amber text-help absolute top-1 right-1 min-w-5 rounded-full px-1 text-center font-semibold tabular-nums"
      >
        {tile.quantity}
      </span>
    </button>
  );
}
