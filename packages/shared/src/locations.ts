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
  /** Distinct products in stock in this piece of furniture (shown before deleting it). */
  productCount: number;
}

/** What a new piece of furniture of each kind starts with (`POST /locations`). */
export interface LocationKindDefaults {
  /** Name shown in the form, and base of the suggested name (« Frigo 2 »). */
  label: string;
  icon: string;
  shelfCount: number;
  /** « Étagère n », « Tiroir n », « Rangée n ». */
  shelfLabel: string;
  shelfKind: ShelfKind;
}

export const LOCATION_KIND_DEFAULTS: Readonly<Record<LocationKind, LocationKindDefaults>> = {
  pantry: {
    label: 'Garde-manger',
    icon: 'warehouse',
    shelfCount: 4,
    shelfLabel: 'Étagère',
    shelfKind: 'plain',
  },
  fridge: {
    label: 'Frigo',
    icon: 'refrigerator',
    shelfCount: 4,
    shelfLabel: 'Étagère',
    shelfKind: 'plain',
  },
  freezer: {
    label: 'Congélateur',
    icon: 'snowflake',
    shelfCount: 3,
    shelfLabel: 'Tiroir',
    shelfKind: 'plain',
  },
  cellar: { label: 'Cave', icon: 'wine', shelfCount: 4, shelfLabel: 'Rangée', shelfKind: 'rack' },
  other: {
    label: 'Placard',
    icon: 'package',
    shelfCount: 4,
    shelfLabel: 'Étagère',
    shelfKind: 'plain',
  },
};

export interface LocationCreateInput {
  name: string;
  kind: LocationKind;
  /** 1 to MAX_SHELVES_PER_LOCATION; omitted: the default of the kind. */
  shelfCount?: number;
}

/**
 * A name not used yet by the household: the label itself, then « label 2 », « label 3 »…
 * (compared without case, like the database).
 */
export function suggestLocationName(label: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!used.has(label.toLowerCase())) return label;
  for (let n = 2; ; n += 1) {
    const candidate = `${label} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
