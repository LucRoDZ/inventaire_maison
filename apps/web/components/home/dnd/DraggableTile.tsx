'use client';

import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import type { HomeTileDto } from '@inventaire/shared';
import { useRef, type CSSProperties } from 'react';
import { tileDragId } from '../../../lib/drop';
import { ProductTile } from '../ProductTile';

interface DraggableTileProps {
  tile: HomeTileDto;
  onSelect?: (tile: HomeTileDto) => void;
  dimmed?: boolean;
}

/** After a drop (or its cancellation) the browser may still send a click: ignore it. */
const CLICK_GUARD_MS = 400;

/** Cards drawn behind a tile: one per unit beyond the first, four at most (quantity 5 and more). */
export const pileSize = (quantity: number): number => Math.max(0, Math.min(quantity, 5) - 1);

/**
 * A tile that can be picked up (long press, mouse, or keyboard) and dropped on a shelf, on top of
 * a decorative pile that grows with the quantity.
 */
export function DraggableTile({ tile, onSelect, dimmed }: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tileDragId(tile.stockItemId),
  });
  const lastDrag = useRef(0);
  useDndMonitor({
    onDragEnd: () => {
      lastDrag.current = Date.now();
    },
    onDragCancel: () => {
      lastDrag.current = Date.now();
    },
  });

  // The pile is scenery around the button, never inside it; a faded tile has none.
  const behind = dimmed ? 0 : pileSize(tile.quantity);
  return (
    <div className={`fx-pile touch-manipulation ${isDragging ? 'opacity-40' : ''}`}>
      {Array.from({ length: behind }, (_, k) => (
        <span
          key={k}
          className="fx-pile-card"
          aria-hidden="true"
          style={{ '--i': k + 1 } as CSSProperties}
        />
      ))}
      <ProductTile
        tile={tile}
        dimmed={dimmed}
        dragRef={setNodeRef}
        dragProps={{
          ...attributes,
          ...listeners,
          style: { WebkitTouchCallout: 'none', userSelect: 'none' },
        }}
        onSelect={(selected) => {
          if (Date.now() - lastDrag.current > CLICK_GUARD_MS) onSelect?.(selected);
        }}
      />
    </div>
  );
}
