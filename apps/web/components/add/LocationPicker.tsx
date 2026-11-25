import type { LocationDto } from '@inventaire/shared';
import type { Place } from '../../lib/add-place';
import { LocationOptions } from '../ui/LocationOptions';

interface LocationPickerProps {
  locations: LocationDto[];
  value: Place;
  onChange: (place: Place) => void;
}

const selectClass = 'tap-target border-line text-ink w-full rounded-xl border bg-white px-3';

/** Location, then an optional shelf of that location ("Non rangé" by default). */
export function LocationPicker({ locations, value, onChange }: LocationPickerProps) {
  const current = locations.find((location) => location.id === value.locationId);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-label flex flex-col gap-1">
        Lieu
        <select
          className={selectClass}
          value={value.locationId}
          // Changing the location empties the shelf: it belonged to the previous one.
          onChange={(event) => onChange({ locationId: Number(event.target.value), shelfId: null })}
        >
          <LocationOptions locations={locations} />
        </select>
      </label>
      <label className="text-label flex flex-col gap-1">
        Étagère
        <select
          className={selectClass}
          value={value.shelfId ?? ''}
          onChange={(event) =>
            onChange({
              locationId: value.locationId,
              shelfId: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        >
          <option value="">Non rangé</option>
          {current?.shelves.map((shelf) => (
            <option key={shelf.id} value={shelf.id}>
              {shelf.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
