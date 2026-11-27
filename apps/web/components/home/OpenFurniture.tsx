import type { HomeLocationDto, HomeTileDto, LocationKind } from '@inventaire/shared';
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
 * The furniture opened: its shelves stacked in order, then the « Non rangé » tray, inside the
 * shell drawn for its kind. The door(s) swing open when it appears.
 */
export function OpenFurniture({ location, onSelect, isDimmed, focusQuery }: OpenFurnitureProps) {
  const look = SHELF_LOOKS[location.kind];
  return (
    <FurnitureShell kind={location.kind} className="open-furniture">
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
