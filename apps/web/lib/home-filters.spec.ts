import type { HomeLocationDto, HomeTileDto } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';
import {
  filtersToQuery,
  isFiltering,
  locationMatches,
  NO_FILTER,
  normalize,
  parseFilters,
  tileMatches,
} from './home-filters';

const tile = (name: string, categoryId: number, brand: string | null = null): HomeTileDto => ({
  stockItemId: 1,
  productId: 1,
  name,
  brand,
  imageUrl: null,
  category: { id: categoryId, name: 'C', icon: 'milk' },
  quantity: 1,
  expiryDate: null,
  expiry: null,
});

const place = (tiles: HomeTileDto[], unshelved: HomeTileDto[] = []): HomeLocationDto => ({
  id: 1,
  name: 'Frigo',
  kind: 'fridge',
  icon: 'x',
  counts: { products: 0, units: 0, expiringSoon: 0 },
  shelves: [{ id: 1, name: 'S', kind: 'plain', tiles }],
  unshelved,
});

describe('normalize', () => {
  it('ignores case and accents', () => {
    expect(normalize('  Lait Demi-Écrémé ')).toBe('lait demi-ecreme');
  });
});

describe('tileMatches', () => {
  it('matches every tile without a filter', () => {
    expect(tileMatches(tile('Lait', 1), NO_FILTER)).toBe(true);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });

  it('filters on the name, without accents or case', () => {
    expect(tileMatches(tile('Lait demi-écrémé', 1), { q: 'ECREME', categoryId: null })).toBe(true);
    expect(tileMatches(tile('Beurre', 1), { q: 'lait', categoryId: null })).toBe(false);
  });

  it('also looks at the brand', () => {
    expect(tileMatches(tile('Pâtes', 1, 'Barilla'), { q: 'barilla', categoryId: null })).toBe(true);
  });

  it('filters on the category', () => {
    expect(tileMatches(tile('Lait', 2), { q: '', categoryId: 2 })).toBe(true);
    expect(tileMatches(tile('Lait', 2), { q: '', categoryId: 3 })).toBe(false);
  });

  it('needs both the text and the category', () => {
    expect(tileMatches(tile('Lait', 2), { q: 'lait', categoryId: 3 })).toBe(false);
    expect(tileMatches(tile('Lait', 2), { q: 'lait', categoryId: 2 })).toBe(true);
  });

  it('treats a text of spaces as no filter', () => {
    expect(isFiltering({ q: '   ', categoryId: null })).toBe(false);
  });
});

describe('locationMatches', () => {
  it('is true when a shelf or the tray holds a match', () => {
    const filters = { q: 'lait', categoryId: null };
    expect(locationMatches(place([tile('Lait', 1)]), filters)).toBe(true);
    expect(locationMatches(place([], [tile('Lait', 1)]), filters)).toBe(true);
    expect(locationMatches(place([tile('Beurre', 1)]), filters)).toBe(false);
    expect(locationMatches(place([]), filters)).toBe(false);
  });
});

describe('URL', () => {
  it('writes and reads the filters', () => {
    expect(filtersToQuery({ q: ' lait ', categoryId: 3 })).toBe('?q=lait&cat=3');
    expect(filtersToQuery(NO_FILTER)).toBe('');
    expect(parseFilters(new URLSearchParams('q=lait&cat=3'))).toEqual({ q: 'lait', categoryId: 3 });
  });

  it('ignores a category that is not an identifier', () => {
    expect(parseFilters(new URLSearchParams('cat=abc')).categoryId).toBeNull();
    expect(parseFilters(new URLSearchParams('cat=-2')).categoryId).toBeNull();
    expect(parseFilters(new URLSearchParams('')).q).toBe('');
  });
});
