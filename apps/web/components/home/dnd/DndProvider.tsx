'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { HomeResponse, HomeTileDto } from '@inventaire/shared';
import { useState, type ReactNode } from 'react';
import {
  findTile,
  isSamePlace,
  parseDropId,
  parseTileId,
  type Destination,
} from '../../../lib/drop';
import { ProductTile } from '../ProductTile';
import { FurnitureDropBar } from './FurnitureDropBar';

interface DndProviderProps {
  home: HomeResponse;
  /** A tile was dropped somewhere else than where it was. */
  onMove: (stockItemId: number, to: Destination) => void;
  children: ReactNode;
}

const DIRECTIONS: Record<string, (dx: number, dy: number) => boolean> = {
  ArrowDown: (_dx, dy) => dy > 1,
  ArrowUp: (_dx, dy) => dy < -1,
  ArrowRight: (dx, dy) => dx > 1 && Math.abs(dx) > Math.abs(dy),
  ArrowLeft: (dx, dy) => dx < -1 && Math.abs(dx) > Math.abs(dy),
};

/**
 * Arrow keys jump to the nearest drop zone in that direction, starting from the zone currently
 * under the tile (the one it came from at first): never by a few pixels, never back onto itself.
 */
const zoneKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableRects, droppableContainers, collisionRect, over }, currentCoordinates },
) => {
  const inDirection = DIRECTIONS[event.code];
  if (!inDirection) return undefined;
  event.preventDefault();
  if (!collisionRect) return undefined;
  const centerOf = (rect: { left: number; top: number; width: number; height: number }) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
  const here = centerOf(collisionRect);
  const overRect = over ? droppableRects.get(over.id) : undefined;
  const reference = overRect ? centerOf(overRect) : here;
  let best: { dx: number; dy: number; distance: number } | null = null;
  for (const container of droppableContainers.getEnabled()) {
    if (container.id === over?.id) continue;
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const target = centerOf(rect);
    if (!inDirection(target.x - reference.x, target.y - reference.y)) continue;
    const distance = Math.hypot(target.x - reference.x, target.y - reference.y);
    if (!best || distance < best.distance)
      best = { dx: target.x - here.x, dy: target.y - here.y, distance };
  }
  return best
    ? { x: currentCoordinates.x + best.dx, y: currentCoordinates.y + best.dy }
    : undefined;
};

/** Drag and drop of the lines of a furniture: long press on a phone, 8 px with a mouse, Space and arrows. */
export function DndProvider({ home, onMove, children }: DndProviderProps) {
  const [activeTile, setActiveTile] = useState<HomeTileDto | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: zoneKeyboardCoordinates }),
  );

  const nameOf = (id: string | number): string => {
    const stockItemId = parseTileId(id);
    return (stockItemId === null ? null : findTile(home, stockItemId)?.tile.name) ?? 'le produit';
  };
  const placeName = (id: string | number | undefined): string => {
    const to = parseDropId(id);
    if (!to) return 'aucune destination';
    const location = home.locations.find((l) => l.id === to.toLocationId);
    const shelf = location?.shelves.find((s) => s.id === to.toShelfId);
    return `${location?.name ?? ''}${shelf ? `, ${shelf.name}` : ', non rangé'}`;
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `${nameOf(active.id)} saisi. Utilisez les flèches pour choisir une destination.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} au-dessus de : ${placeName(over.id)}.`
        : `${nameOf(active.id)} n’est au-dessus d’aucune destination.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} déposé : ${placeName(over.id)}.`
        : `${nameOf(active.id)} reposé à sa place.`,
    onDragCancel: ({ active }) => `Déplacement annulé : ${nameOf(active.id)} reste à sa place.`,
  };

  const start = ({ active }: DragStartEvent) => {
    const stockItemId = parseTileId(active.id);
    setActiveTile(stockItemId === null ? null : (findTile(home, stockItemId)?.tile ?? null));
  };

  const end = ({ active, over }: DragEndEvent) => {
    setActiveTile(null);
    const stockItemId = parseTileId(active.id);
    const to = parseDropId(over?.id);
    const origin = stockItemId === null ? null : findTile(home, stockItemId);
    if (stockItemId === null || !to || !origin || isSamePlace(origin, to)) return;
    onMove(stockItemId, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Pour déplacer ce produit, appuyez sur Espace, choisissez une destination avec les flèches, puis appuyez sur Espace pour déposer. Échap annule.',
        },
      }}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setActiveTile(null)}
    >
      {activeTile ? <FurnitureDropBar locations={home.locations} /> : null}
      {children}
      <DragOverlay>{activeTile ? <ProductTile tile={activeTile} /> : null}</DragOverlay>
    </DndContext>
  );
}
