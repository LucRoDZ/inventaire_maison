import type { HomeLocationDto, HomeTileDto, LocationKind } from '@inventaire/shared';
import type { CSSProperties } from 'react';
import { FurnitureShell } from './FurnitureShell';
import { ShelfRow, type ShelfLook } from './ShelfRow';
import { UnshelvedTray } from './UnshelvedTray';

interface OpenFurnitureProps {
  location: HomeLocationDto;
  onSelect?: (tile: HomeTileDto) => void;
  isDimmed?: (tile: HomeTileDto) => boolean;
  /** `?q=…`: the filters follow into the focus page of a shelf. */
  focusQuery?: string;
}

/** Glass shelves in the fridge, drawers in the freezer, indigo boards elsewhere. */
const SHELF_LOOKS: Record<LocationKind, ShelfLook> = {
  fridge: 'glass',
  freezer: 'drawer',
  pantry: 'board',
  cellar: 'board',
  other: 'board',
};

/**
 * What furniture.css needs to give every shelf the same height without measuring anything: the
 * number of shelves (--n), how many rows share the height (--fx-slots: the tray counts once it
 * holds something), the fixed height of an empty tray, and the frame of a drawer.
 */
export function shelvesVars(location: HomeLocationDto): CSSProperties {
  const trayFilled = location.unshelved.length > 0;
  return {
    '--n': location.shelves.length,
    '--fx-slots': Math.max(1, location.shelves.length + (trayFilled ? 1 : 0)),
    '--fx-tray-fixed': trayFilled ? '0px' : '56px',
    '--fx-row-chrome': location.kind === 'freezer' ? '7px' : '0px',
  } as CSSProperties;
}

/**
 * The furniture opened: its shelves stacked in order, then the « Non rangé » tray, inside the
 * shell drawn for its kind. The door(s) swing open when it appears.
 */
export function OpenFurniture({ location, onSelect, isDimmed, focusQuery }: OpenFurnitureProps) {
  const look = SHELF_LOOKS[location.kind];
  return (
    <FurnitureShell
      kind={location.kind}
      className="open-furniture"
      shelvesStyle={shelvesVars(location)}
    >
      {location.shelves.map((shelf, index) => (
        <ShelfRow
          key={shelf.id}
          locationId={location.id}
          shelf={shelf}
          onSelect={onSelect}
          isDimmed={isDimmed}
          look={look}
          index={index}
          focusQuery={focusQuery}
        />
      ))}
      <UnshelvedTray
        locationId={location.id}
        tiles={location.unshelved}
        onSelect={onSelect}
        isDimmed={isDimmed}
        focusQuery={focusQuery}
      />
    </FurnitureShell>
  );
}
