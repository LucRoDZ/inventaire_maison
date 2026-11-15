import type { HomeLocationDto, HomeTileDto } from '@inventaire/shared';
import { ShelfRow } from './ShelfRow';
import { UnshelvedTray } from './UnshelvedTray';

interface OpenFurnitureProps {
  location: HomeLocationDto;
  onSelect?: (tile: HomeTileDto) => void;
  isDimmed?: (tile: HomeTileDto) => boolean;
}

/** The furniture opened: its shelves stacked in order, then the « Non rangé » tray. */
export function OpenFurniture({ location, onSelect, isDimmed }: OpenFurnitureProps) {
  return (
    <div className="open-furniture flex flex-col gap-4">
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
    </div>
  );
}
