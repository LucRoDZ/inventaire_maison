import { parseNetQuantity, parseQuickEntry } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';

const item = (
  name: string,
  quantity = 1,
  amount: number | null = null,
  unit: string | null = null,
) => ({ name, quantity, amount, unit });

describe('parseQuickEntry', () => {
  it.each([
    ['3 pommes', item('pommes', 3)],
    ['2 x lait', item('lait', 2)],
    ['2x lait', item('lait', 2)],
    ['2 × lait', item('lait', 2)],
    ['500 g de farine', item('farine', 1, 500, 'g')],
    ['500g farine', item('farine', 1, 500, 'g')],
    ['500 G Farine', item('Farine', 1, 500, 'g')],
    ["1,5 l d'eau", item('eau', 1, 1.5, 'l')],
    ['1.5 L d’eau', item('eau', 1, 1.5, 'l')],
    ['1,5l eau', item('eau', 1, 1.5, 'l')],
    ['2 kg de sucre', item('sucre', 1, 2, 'kg')],
    ['75 cl de vin', item('vin', 1, 75, 'cl')],
    ['250 ml de crème', item('crème', 1, 250, 'ml')],
    ['beurre', item('beurre')],
    ['  Crème fraîche ', item('Crème fraîche')],
    ['6 œufs', item('œufs', 6)],
    ['1 kg de pommes de terre', item('pommes de terre', 1, 1, 'kg')],
    ['2 unités de yaourt', item('yaourt', 2)],
    ['1 unité de pain', item('pain', 1)],
    ['3 unites yaourt', item('yaourt', 3)],
    ['lait   demi-écrémé', item('lait demi-écrémé')],
    ['12 yaourts nature', item('yaourts nature', 12)],
    ["2 d'oeufs", item('oeufs', 2)],
    ['pâtes 500 g', item('pâtes 500 g')],
    ['Café', item('Café')],
    ['1 l', null],
    ['25 cl', null],
    ['3', null],
    ['2 x', null],
    ['', null],
    ['   ', null],
  ])('%j', (input, expected) => {
    expect(parseQuickEntry(input)).toEqual(expected);
  });

  it('keeps "unité" alone as a name', () => {
    expect(parseQuickEntry('unité')).toEqual(item('unité'));
  });
});

describe('parseNetQuantity', () => {
  it.each([
    ['226,8 g', { amount: 226.8, unit: 'g' }],
    ['1.5 L', { amount: 1.5, unit: 'l' }],
    ['6 x 25 cl', { amount: 25, unit: 'cl' }],
    ['4 × 125 g', { amount: 125, unit: 'g' }],
    ['500 ml', { amount: 500, unit: 'ml' }],
    ['1kg', { amount: 1, unit: 'kg' }],
    ['330 ml e', { amount: 330, unit: 'ml' }],
  ])('%j', (input, expected) => {
    expect(parseNetQuantity(input)).toEqual(expected);
  });

  it.each(['', 'garbage', '12', 'about 5 g', '0 g', '3 pièces', null, undefined])(
    'null for %j',
    (input) => {
      expect(parseNetQuantity(input)).toBeNull();
    },
  );
});
