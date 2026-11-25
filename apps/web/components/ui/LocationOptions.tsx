import { LOCATION_KINDS, type LocationKind } from '@inventaire/shared';

/** Group labels of a long list of furniture. */
export const LOCATION_GROUP_LABELS: Record<LocationKind, string> = {
  pantry: 'Garde-mangers',
  fridge: 'Frigos',
  freezer: 'Congélateurs',
  cellar: 'Caves',
  other: 'Autres meubles',
};

/** From this many pieces of furniture, a list is grouped by kind. */
export const GROUP_FROM = 6;

interface LocationOptionsProps {
  locations: { id: number; name: string; kind: LocationKind }[];
  /** A piece of furniture left out of the list (the one being deleted). */
  exclude?: number;
}

/**
 * The `<option>` elements of a furniture picker. Names are unique in a household, so each label is
 * too; from 6 pieces of furniture they are grouped by kind (`<optgroup>`), in the order of the
 * house within each group.
 */
export function LocationOptions({ locations, exclude }: LocationOptionsProps) {
  const shown = locations.filter((location) => location.id !== exclude);
  if (shown.length < GROUP_FROM) {
    return (
      <>
        {shown.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {LOCATION_KINDS.map((kind) => {
        const group = shown.filter((location) => location.kind === kind);
        if (group.length === 0) return null;
        return (
          <optgroup key={kind} label={LOCATION_GROUP_LABELS[kind]}>
            {group.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
