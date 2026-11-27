import type { CategoryDto, HomeLocationDto, HomeTileDto } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  clearPanelFilters,
  filterSummary,
  filtersToQuery,
  withKnownFilters,
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
  counts: { products: 0, units: 0, expired: 0, soon: 0 },
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
    expect(tileMatches(tile('Lait demi-écrémé', 1), { ...NO_FILTER, q: 'ECREME' })).toBe(true);
    expect(tileMatches(tile('Beurre', 1), { ...NO_FILTER, q: 'lait' })).toBe(false);
  });

  it('also looks at the brand', () => {
    expect(tileMatches(tile('Pâtes', 1, 'Barilla'), { ...NO_FILTER, q: 'barilla' })).toBe(true);
  });

  it('filters on the category', () => {
    expect(tileMatches(tile('Lait', 2), { ...NO_FILTER, q: '', categoryIds: [2] })).toBe(true);
    expect(tileMatches(tile('Lait', 2), { ...NO_FILTER, q: '', categoryIds: [3] })).toBe(false);
  });

  it('needs both the text and the category', () => {
    expect(tileMatches(tile('Lait', 2), { ...NO_FILTER, q: 'lait', categoryIds: [3] })).toBe(false);
    expect(tileMatches(tile('Lait', 2), { ...NO_FILTER, q: 'lait', categoryIds: [2] })).toBe(true);
  });

  it('treats a text of spaces as no filter', () => {
    expect(isFiltering({ ...NO_FILTER, q: '   ' })).toBe(false);
  });
});

describe('locationMatches', () => {
  it('is true when a shelf or the tray holds a match', () => {
    const filters = { ...NO_FILTER, q: 'lait' };
    expect(locationMatches(place([tile('Lait', 1)]), filters)).toBe(true);
    expect(locationMatches(place([], [tile('Lait', 1)]), filters)).toBe(true);
    expect(locationMatches(place([tile('Beurre', 1)]), filters)).toBe(false);
    expect(locationMatches(place([]), filters)).toBe(false);
  });
});

describe('URL', () => {
  it('writes and reads the filters', () => {
    const filters = {
      q: ' lait ',
      categoryIds: [3, 5],
      locationId: 7,
      sort: 'name' as const,
      expiry: 'soon' as const,
    };
    expect(filtersToQuery(filters)).toBe('?q=lait&cat=3%2C5&meuble=7&tri=name&echeance=bientot');
    expect(filtersToQuery(NO_FILTER)).toBe('');
    expect(parseFilters(new URLSearchParams(filtersToQuery(filters)))).toEqual({
      ...filters,
      q: 'lait',
    });
  });

  it('reads the expiry filter of the counters and keeps the default order out of the link', () => {
    const filters = { ...NO_FILTER, expiry: 'expired' as const };
    expect(filtersToQuery(filters)).toBe('?echeance=perime');
    expect(parseFilters(new URLSearchParams('echeance=aujourdhui')).expiry).toBe('today');
    expect(parseFilters(new URLSearchParams('echeance=nimporte')).expiry).toBeNull();
    expect(filtersToQuery({ ...NO_FILTER, sort: 'name' })).toBe('?tri=name');
  });

  it('matches a tile on its expiry bucket, like the server', () => {
    const tileWith = (expiry: HomeTileDto['expiry']): HomeTileDto => ({
      ...tile('Lait', 1),
      expiry,
    });
    const today = { ...NO_FILTER, expiry: 'today' as const };
    const soon = { ...NO_FILTER, expiry: 'soon' as const };
    const expired = { ...NO_FILTER, expiry: 'expired' as const };
    expect(tileMatches(tileWith({ status: 'soon', days: 0 }), today)).toBe(true);
    expect(tileMatches(tileWith({ status: 'soon', days: 2 }), today)).toBe(false);
    expect(tileMatches(tileWith({ status: 'soon', days: 2 }), soon)).toBe(true);
    expect(tileMatches(tileWith({ status: 'expired' }), expired)).toBe(true);
    expect(tileMatches(tileWith({ status: 'expired' }), soon)).toBe(false);
    expect(tileMatches(tileWith(null), expired)).toBe(false);
    expect(isFiltering(expired)).toBe(true);
  });

  it('ignores what is not an identifier or a known order', () => {
    const parsed = parseFilters(new URLSearchParams('cat=abc,-2,4,4&meuble=x&tri=prix'));
    expect(parsed.categoryIds).toEqual([4]);
    expect(parsed.locationId).toBeNull();
    expect(parsed.sort).toBe('expiry');
    expect(parsed.expiry).toBeNull();
    expect(parseFilters(new URLSearchParams('')).q).toBe('');
  });
});

describe('panel filters', () => {
  const filters = {
    q: 'lait',
    categoryIds: [1, 2],
    locationId: 7,
    sort: 'added' as const,
    expiry: null,
  };

  it('counts the categories, and the furniture in the list view only', () => {
    expect(activeFilterCount(filters, 'home')).toBe(2);
    expect(activeFilterCount(filters, 'list')).toBe(3);
    expect(activeFilterCount(NO_FILTER, 'list')).toBe(0);
  });

  it('clears the filters of one view and keeps the search', () => {
    expect(clearPanelFilters(filters, 'home')).toEqual({ ...filters, categoryIds: [] });
    expect(clearPanelFilters(filters, 'list')).toEqual({ ...NO_FILTER, q: 'lait' });
  });

  it('says the furniture then the categories', () => {
    const categories = [
      { id: 1, name: 'Boissons', icon: 'package', sortOrder: 1, isFallback: false } as CategoryDto,
      { id: 2, name: 'Viandes', icon: 'package', sortOrder: 2, isFallback: false } as CategoryDto,
    ];
    const places = [{ id: 7, name: 'Frigo' }];
    expect(filterSummary(filters, 'list', categories, places)).toBe('Frigo · Boissons · Viandes');
    expect(filterSummary(filters, 'home', categories, places)).toBe('Boissons · Viandes');
    expect(filterSummary(NO_FILTER, 'list', categories, places)).toBe('');
  });
});

describe('withKnownFilters', () => {
  it('drops the ids that no longer exist, once the lists are loaded', () => {
    const filters = { ...NO_FILTER, categoryIds: [1, 9], locationId: 7 };
    expect(withKnownFilters(filters, [{ id: 1 }], [{ id: 3 }])).toEqual({
      ...NO_FILTER,
      categoryIds: [1],
      locationId: null,
    });
    expect(withKnownFilters(filters, null, null)).toBe(filters);
    expect(withKnownFilters(filters, [{ id: 1 }, { id: 9 }], [{ id: 7 }])).toBe(filters);
  });
});
