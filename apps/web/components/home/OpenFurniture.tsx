import type { HomeLocationDto, HomeTileDto } from '@inventaire/shared';
import { FurnitureShell } from './FurnitureShell';
import { ShelfRow } from './ShelfRow';
import { UnshelvedTray } from './UnshelvedTray';

interface OpenFurnitureProps {
  location: HomeLocationDto;
  onSelect?: (tile: HomeTileDto) => void;
  isDimmed?: (tile: HomeTileDto) => boolean;
}

/**
 * The furniture opened: its shelves stacked in order, then the « Non rangé » tray, inside the
 * shell drawn for its kind. The door(s) swing open when it appears.
 */
export function OpenFurniture({ location, onSelect, isDimmed }: OpenFurnitureProps) {
  return (
    <FurnitureShell kind={location.kind} className="open-furniture">
      {location.shelves.map((shelf) => (
        <ShelfRow
          key={shelf.id}
          locationId={location.id}
          shelf={shelf}
          onSelect={onSelect}
          isDimmed={isDimmed}
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
