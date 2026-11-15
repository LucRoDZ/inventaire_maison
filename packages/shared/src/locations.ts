export const LOCATION_KINDS = ['pantry', 'fridge', 'freezer', 'cellar', 'other'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/** `rack` draws a row of slots, `plain` a flat shelf. */
export const SHELF_KINDS = ['rack', 'plain'] as const;
export type ShelfKind = (typeof SHELF_KINDS)[number];

/** Locations and shelves: 1 to 40 characters once trimmed. */
export const PLACE_NAME_MAX_LENGTH = 40;

export interface ShelfDto {
  id: number;
  locationId: number;
  name: string;
  kind: ShelfKind;
  sortOrder: number;
}

export interface LocationDto {
  id: number;
  name: string;
  kind: LocationKind;
  icon: string;
  sortOrder: number;
  shelves: ShelfDto[];
}
