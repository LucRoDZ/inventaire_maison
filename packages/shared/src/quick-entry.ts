import type { QuantityUnit } from './comfort';

/** Result of the quick entry of the shopping list ("3 pommes", "500 g de farine"). */
export interface QuickEntry {
  /** What remains once quantity and unit are read: the text to match against the catalogue. */
  name: string;
  /** Number of items (1 when absent). */
  quantity: number;
  /** Net amount when a unit was given ("500 g", "1,5 l"); null otherwise. */
  amount: number | null;
  unit: QuantityUnit | null;
}

/**
 * Deterministic parser of the quick entry, no language model. Understands "3 pommes",
 * "2 x lait", "500 g de farine", "1,5 l d'eau", "beurre"; units g, kg, ml, cl, l, unité.
 * Returns null for an empty text.
 *
 * Contract stub: the full implementation and its tests come with task B2.
 */
export function parseQuickEntry(text: string): QuickEntry | null {
  const name = text.trim().replace(/\s+/g, ' ');
  if (name === '') return null;
  return { name, quantity: 1, amount: null, unit: null };
}

/**
 * Reads a net content as printed by Open Food Facts ("226,8 g", "1.5 L", "6 x 25 cl" gives the
 * unit content). Null when it cannot be read.
 *
 * Contract stub: the full implementation and its tests come with task C1 (API side).
 */
export function parseNetQuantity(text: string | null | undefined): {
  amount: number;
  unit: QuantityUnit;
} | null {
  void text;
  return null;
}
