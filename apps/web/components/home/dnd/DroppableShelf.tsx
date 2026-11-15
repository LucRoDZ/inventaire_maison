'use client';

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface DroppableShelfProps {
  id: string;
  children: ReactNode;
  className?: string;
}

/** A drop zone: it lights up (amber outline) while a tile is over it. */
export function DroppableShelf({ id, children, className = '' }: DroppableShelfProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} rounded-xl ${isOver ? 'ring-amber ring-4' : ''}`}
    >
      {children}
    </div>
  );
}
