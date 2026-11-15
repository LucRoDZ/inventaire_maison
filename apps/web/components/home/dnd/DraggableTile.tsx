'use client';

import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import type { HomeTileDto } from '@inventaire/shared';
import { useRef } from 'react';
import { tileDragId } from '../../../lib/drop';
import { ProductTile } from '../ProductTile';

interface DraggableTileProps {
  tile: HomeTileDto;
  onSelect?: (tile: HomeTileDto) => void;
  dimmed?: boolean;
}

/** After a drop (or its cancellation) the browser may still send a click: ignore it. */
const CLICK_GUARD_MS = 400;

/** A tile that can be picked up (long press, mouse, or keyboard) and dropped on a shelf. */
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

  return (
    <div className={`touch-manipulation ${isDragging ? 'opacity-40' : ''}`}>
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
