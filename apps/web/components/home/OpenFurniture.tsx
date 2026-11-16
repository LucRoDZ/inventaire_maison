import type { HomeLocationDto, HomeTileDto, LocationKind } from '@inventaire/shared';
import { FurnitureShell } from './FurnitureShell';
import { ShelfRow, type ShelfLook } from './ShelfRow';
import { UnshelvedTray } from './UnshelvedTray';

interface OpenFurnitureProps {
  location: HomeLocationDto;
  onSelect?: (tile: HomeTileDto) => void;
  isDimmed?: (tile: HomeTileDto) => boolean;
}

/** Glass shelves in the cold furniture, indigo boards under an amber spot in the cupboards. */
const SHELF_LOOKS: Record<LocationKind, { look: ShelfLook; spot: boolean }> = {
  fridge: { look: 'glass', spot: false },
  freezer: { look: 'glass', spot: false },
  pantry: { look: 'board', spot: true },
  cellar: { look: 'board', spot: true },
  other: { look: 'board', spot: true },
};

/**
 * The furniture opened: its shelves stacked in order, then the « Non rangé » tray, inside the
 * shell drawn for its kind. The door(s) swing open when it appears.
 */
export function OpenFurniture({ location, onSelect, isDimmed }: OpenFurnitureProps) {
  const { look, spot } = SHELF_LOOKS[location.kind];
  return (
    <FurnitureShell kind={location.kind} className="open-furniture">
      {location.shelves.map((shelf) => (
        <ShelfRow
          key={shelf.id}
          locationId={location.id}
          shelf={shelf}
          onSelect={onSelect}
          isDimmed={isDimmed}
          look={look}
          spot={spot}
        />
      ))}
      <UnshelvedTray
        locationId={location.id}
        tiles={location.unshelved}
        onSelect={onSelect}
        isDimmed={isDimmed}
      />
    </FurnitureShell>
  );
}
