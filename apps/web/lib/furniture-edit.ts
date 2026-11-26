import { CATEGORY_ICONS, PLACE_NAME_MAX_LENGTH } from '@inventaire/shared';

/** Renumbers a list after moving one item, and returns only what changed. */
export function reorder<T extends { id: number; sortOrder: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): { id: number; sortOrder: number }[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [];
  const ids = items.map((item) => item.id);
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids.flatMap((id, position) =>
    items.find((item) => item.id === id)!.sortOrder === position
      ? []
      : [{ id, sortOrder: position }],
  );
}

/**
 * Why a name cannot be given to a piece of furniture, or null when it can. `others`: the names of
 * the other pieces of furniture of the house (compared without case, like the database).
 */
export function furnitureNameError(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Donnez un nom au meuble.';
  if (trimmed.length > PLACE_NAME_MAX_LENGTH) return `${PLACE_NAME_MAX_LENGTH} caractères au plus.`;
  if (others.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase()))
    return 'Un meuble porte déjà ce nom : choisissez-en un autre.';
  return null;
}

/** Icons offered for a piece of furniture: those of the kinds, then those of the categories. */
export const FURNITURE_ICON_CHOICES: readonly string[] = [
  'warehouse',
  'refrigerator',
  ...CATEGORY_ICONS.filter((icon) => icon !== 'package'),
  'package',
];
