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

const UNIT_WORDS: Readonly<Record<string, QuantityUnit>> = {
  g: 'g',
  gr: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  l: 'l',
  unite: 'unit',
  unites: 'unit',
  unit: 'unit',
  units: 'unit',
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

function unitOf(word: string): QuantityUnit | null {
  const key = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return UNIT_WORDS[key] ?? null;
}

function cleanText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Removes a leading "de " or "d'" joined to a name. */
function stripPartitive(rest: string): string {
  return rest.replace(/^(?:de\s+|d'\s*)/i, '').trim();
}

const WITH_UNIT = new RegExp(String.raw`^${NUMBER}\s*(\p{L}+)(?=$|\s|')\s*(.*)$`, 'u');
const COUNTED = /^(\d+)\s*(?:[x×]\s+|[x×](?=\p{L})|\s+)(.+)$/u;

/**
 * Deterministic parser of the quick entry, no language model. Understands "3 pommes",
 * "2 x lait", "500 g de farine", "1,5 l d'eau", "beurre"; units g, kg, ml, cl, l, unité.
 * Returns null for an empty text, or when no name remains ("3", "25 cl").
 */
export function parseQuickEntry(text: string): QuickEntry | null {
  const t = cleanText(text);
  if (t === '') return null;

  // "500 g de farine", "1,5 l d'eau", "2 unités de yaourt".
  const withUnit = WITH_UNIT.exec(t);
  if (withUnit) {
    const unit = unitOf(withUnit[2] as string);
    const value = toNumber(withUnit[1] as string);
    if (unit !== null && value > 0) {
      const name = stripPartitive(withUnit[3] as string);
      if (name === '') return null;
      if (unit === 'unit') {
        return Number.isInteger(value)
          ? { name, quantity: value, amount: null, unit: null }
          : { name, quantity: 1, amount: value, unit };
      }
      return { name, quantity: 1, amount: value, unit };
    }
  }

  // "2 x lait", "2x lait", "3 pommes".
  const counted = COUNTED.exec(t);
  if (counted) {
    const quantity = Number(counted[1]);
    const name = stripPartitive(counted[2] as string);
    if (/^[x×]$/i.test(name)) return null;
    if (quantity >= 1 && name !== '') return { name, quantity, amount: null, unit: null };
  }

  // A number alone leaves no name.
  if (/^[\d\s.,x×]+$/i.test(t)) return null;
  return { name: t, quantity: 1, amount: null, unit: null };
}

const MULTI_PACK = new RegExp(String.raw`^\d+\s*[x×]\s*${NUMBER}\s*(\p{L}+)\b`, 'u');
const SINGLE = new RegExp(String.raw`^${NUMBER}\s*(\p{L}+)\b`, 'u');

/**
 * Reads a net content as printed by Open Food Facts ("226,8 g", "1.5 L", "6 x 25 cl" gives the
 * unit content). Null when it cannot be read.
 */
export function parseNetQuantity(text: string | null | undefined): {
  amount: number;
  unit: QuantityUnit;
} | null {
  if (!text) return null;
  const t = text.trim();
  const m = MULTI_PACK.exec(t) ?? SINGLE.exec(t);
  if (!m) return null;
  const unit = unitOf(m[2] as string);
  const amount = toNumber(m[1] as string);
  if (unit === null || unit === 'unit' || !(amount > 0)) return null;
  return { amount, unit };
}
