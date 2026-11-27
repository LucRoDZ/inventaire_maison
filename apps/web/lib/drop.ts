import type { HomeLocationDto, HomeResponse, HomeTileDto } from '@inventaire/shared';

/** Identifiers of the drop zones and of the dragged tiles (shared by the drag-and-drop components). */
export const shelfDropId = (locationId: number, shelfId: number) =>
  `shelf:${locationId}:${shelfId}`;
export const trayDropId = (locationId: number) => `tray:${locationId}`;
export const furnitureDropId = (locationId: number) => `furniture:${locationId}`;
export const tileDragId = (stockItemId: number) => `tile:${stockItemId}`;

export interface Destination {
  toLocationId: number;
  /** Null: the « Non rangé » tray of the furniture. */
  toShelfId: number | null;
}

export function parseTileId(id: string | number): number | null {
  const match = /^tile:(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : null;
}

/** The destination a drop zone stands for; a drop on a furniture means its « Non rangé » tray. */
export function parseDropId(id: string | number | null | undefined): Destination | null {
  const text = String(id ?? '');
  const shelf = /^shelf:(\d+):(\d+)$/.exec(text);
  if (shelf) return { toLocationId: Number(shelf[1]), toShelfId: Number(shelf[2]) };
  const place = /^(?:tray|furniture):(\d+)$/.exec(text);
  if (place) return { toLocationId: Number(place[1]), toShelfId: null };
  return null;
}

interface Placed {
  tile: HomeTileDto;
  locationId: number;
  shelfId: number | null;
}

export function findTile(home: HomeResponse, stockItemId: number): Placed | null {
  for (const location of home.locations) {
    for (const shelf of location.shelves) {
      const tile = shelf.tiles.find((t) => t.stockItemId === stockItemId);
      if (tile) return { tile, locationId: location.id, shelfId: shelf.id };
    }
    const tile = location.unshelved.find((t) => t.stockItemId === stockItemId);
    if (tile) return { tile, locationId: location.id, shelfId: null };
  }
  return null;
}

/** True when dropping the line there changes nothing. */
export function isSamePlace(
  origin: { locationId: number; shelfId: number | null },
  to: Destination,
): boolean {
  return origin.locationId === to.toLocationId && origin.shelfId === to.toShelfId;
}

function recount(location: HomeLocationDto): HomeLocationDto {
  const tiles = [...location.shelves.flatMap((s) => s.tiles), ...location.unshelved];
  return {
    ...location,
    counts: {
      products: new Set(tiles.map((t) => t.productId)).size,
      units: tiles.reduce((sum, t) => sum + t.quantity, 0),
      expired: tiles.filter((t) => t.expiry?.status === 'expired').length,
      soon: tiles.filter((t) => t.expiry?.status === 'soon').length,
    },
  };
}

const addTo = (tiles: HomeTileDto[], moved: HomeTileDto): HomeTileDto[] => {
  // Same product and same date at the destination: the quantities add up (decision A5).
  const twin = tiles.find(
    (t) => t.productId === moved.productId && t.expiryDate === moved.expiryDate,
  );
  return twin
    ? tiles.map((t) => (t === twin ? { ...t, quantity: t.quantity + moved.quantity } : t))
    : [...tiles, moved];
};

/**
 * What the screen shows right after a drop, before the server answers: the whole line leaves its
 * place and lands (merged if needed) at the destination. Pure, so a failure just restores `home`.
 */
export function applyMove(home: HomeResponse, stockItemId: number, to: Destination): HomeResponse {
  const found = findTile(home, stockItemId);
  if (!found || isSamePlace(found, to)) return home;
  const locations = home.locations.map((location) => {
    let next = location;
    if (location.id === found.locationId) {
      next = {
        ...next,
        shelves: next.shelves.map((s) => ({
          ...s,
          tiles: s.tiles.filter((t) => t.stockItemId !== stockItemId),
        })),
        unshelved: next.unshelved.filter((t) => t.stockItemId !== stockItemId),
      };
    }
    if (location.id === to.toLocationId) {
      next =
        to.toShelfId === null
          ? { ...next, unshelved: addTo(next.unshelved, found.tile) }
          : {
              ...next,
              shelves: next.shelves.map((s) =>
                s.id === to.toShelfId ? { ...s, tiles: addTo(s.tiles, found.tile) } : s,
              ),
            };
    }
    return next === location ? location : recount(next);
  });
  return { locations };
}
