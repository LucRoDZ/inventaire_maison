import type { LocationDto } from '@inventaire/shared';

export const LAST_LOCATION_KEY = 'inv_last_location';

export interface Place {
  locationId: number;
  shelfId: number | null;
}

interface PlaceInputs {
  locations: LocationDto[];
  /** Furniture and shelf the scanner was opened from. */
  origin?: { locationId: number; shelfId?: number | null } | null;
  usualLocationId: number | null;
  lastLocationId: number | null;
}

/**
 * Where the add sheet starts (decision A6): where the scanner was opened from, then the usual
 * location of the product, then the last one used on this device, then the first location.
 */
export function pickInitialPlace({
  locations,
  origin,
  usualLocationId,
  lastLocationId,
}: PlaceInputs): Place | null {
  const known = (id: number | null | undefined): id is number =>
    id != null && locations.some((location) => location.id === id);

  if (origin && known(origin.locationId)) {
    const shelfId = origin.shelfId ?? null;
    const owns = locations
      .find((l) => l.id === origin.locationId)
      ?.shelves.some((shelf) => shelf.id === shelfId);
    return { locationId: origin.locationId, shelfId: owns ? shelfId : null };
  }
  if (known(usualLocationId)) return { locationId: usualLocationId, shelfId: null };
  if (known(lastLocationId)) return { locationId: lastLocationId, shelfId: null };
  const first = locations[0];
  return first ? { locationId: first.id, shelfId: null } : null;
}

export function readLastLocation(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_LOCATION_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastLocation(id: number): void {
  try {
    window.localStorage.setItem(LAST_LOCATION_KEY, String(id));
  } catch {
    // Private mode: the memory of the last place is a convenience only.
  }
}
