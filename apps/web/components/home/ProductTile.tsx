import type { HomeTileDto } from '@inventaire/shared';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { categoryIcon } from '../ui/CategoryIcon';

interface ProductTileProps {
  tile: HomeTileDto;
  /** Opens the product panel. */
  onSelect?: (tile: HomeTileDto) => void;
  /** Set by the drag-and-drop wrapper: the button itself is the draggable element. */
  dragRef?: Ref<HTMLButtonElement>;
  dragProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}

/** Square thumbnail: the photo or the category glyph, with an amber quantity badge. */
export function ProductTile({ tile, onSelect, dragRef, dragProps }: ProductTileProps) {
  const Glyph = categoryIcon(tile.category.icon);
  return (
    <button
      ref={dragRef}
      type="button"
      {...dragProps}
      onClick={() => onSelect?.(tile)}
      aria-label={`${tile.name}, quantité ${tile.quantity}`}
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white"
    >
      {tile.imageUrl ? (
        <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="bg-lavender text-indigo flex h-full w-full items-center justify-center">
          <Glyph size={32} aria-hidden="true" />
        </span>
      )}
      <span
        aria-hidden="true"
        className="bg-amber text-indigo text-help absolute top-1 right-1 min-w-5 rounded-full px-1 text-center font-bold"
      >
        {tile.quantity}
      </span>
    </button>
  );
}
