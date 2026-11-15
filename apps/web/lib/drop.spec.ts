import type { HomeLocationDto, HomeResponse, HomeTileDto } from '@inventaire/shared';
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  findTile,
  furnitureDropId,
  isSamePlace,
  parseDropId,
  parseTileId,
  shelfDropId,
  tileDragId,
  trayDropId,
} from './drop';

const tile = (
  id: number,
  productId: number,
  quantity: number,
  expiryDate: string | null = null,
  soon = false,
): HomeTileDto => ({
  stockItemId: id,
  productId,
  name: `P${productId}`,
  brand: null,
  imageUrl: null,
  category: { id: 1, name: 'C', icon: 'milk' },
  quantity,
  expiryDate,
  expiry: soon ? { status: 'soon', days: 1 } : null,
});
const location = (
  id: number,
  shelves: { id: number; tiles: HomeTileDto[] }[],
  unshelved: HomeTileDto[] = [],
): HomeLocationDto => ({
  id,
  name: `L${id}`,
  kind: 'fridge',
  icon: 'x',
  counts: { products: 0, units: 0, expiringSoon: 0 },
  shelves: shelves.map((s) => ({ id: s.id, name: `S${s.id}`, kind: 'plain', tiles: s.tiles })),
  unshelved,
});
const home = (): HomeResponse => ({
  locations: [
    location(1, [
      { id: 10, tiles: [tile(100, 7, 2, '2026-12-01', true)] },
      { id: 11, tiles: [tile(101, 7, 3, '2026-12-01'), tile(102, 8, 1)] },
    ]),
    location(2, [{ id: 20, tiles: [] }], [tile(103, 9, 4)]),
  ],
});

describe('identifiers', () => {
  it('round-trips the drop zones', () => {
    expect(parseDropId(shelfDropId(1, 10))).toEqual({ toLocationId: 1, toShelfId: 10 });
    expect(parseDropId(trayDropId(2))).toEqual({ toLocationId: 2, toShelfId: null });
    expect(parseDropId(furnitureDropId(3))).toEqual({ toLocationId: 3, toShelfId: null });
  });

  it('rejects anything that is not a drop zone', () => {
    for (const id of [null, undefined, '', 'tile:5', 'shelf:1', 'shelf:a:2', 'tray:']) {
      expect(parseDropId(id)).toBeNull();
    }
  });

  it('reads the tile identifier', () => {
    expect(parseTileId(tileDragId(42))).toBe(42);
    expect(parseTileId('shelf:1:2')).toBeNull();
  });
});

describe('drop logic', () => {
  it('finds a tile and where it is', () => {
    expect(findTile(home(), 102)).toMatchObject({ locationId: 1, shelfId: 11 });
    expect(findTile(home(), 103)).toMatchObject({ locationId: 2, shelfId: null });
    expect(findTile(home(), 999)).toBeNull();
  });

  it('recognises the origin as no move', () => {
    expect(isSamePlace({ locationId: 1, shelfId: 10 }, { toLocationId: 1, toShelfId: 10 })).toBe(
      true,
    );
    expect(
      isSamePlace({ locationId: 1, shelfId: null }, { toLocationId: 1, toShelfId: null }),
    ).toBe(true);
    expect(isSamePlace({ locationId: 1, shelfId: 10 }, { toLocationId: 1, toShelfId: null })).toBe(
      false,
    );
    expect(isSamePlace({ locationId: 1, shelfId: 10 }, { toLocationId: 2, toShelfId: 10 })).toBe(
      false,
    );
  });

  it('moves the whole line to another shelf and recounts', () => {
    const before = home();
    const after = applyMove(before, 102, { toLocationId: 1, toShelfId: 10 });
    const shelves = after.locations[0]!.shelves;
    expect(shelves[1]!.tiles.map((t) => t.stockItemId)).toEqual([101]);
    expect(shelves[0]!.tiles.map((t) => t.stockItemId)).toEqual([100, 102]);
    expect(after.locations[0]!.counts).toEqual({ products: 2, units: 6, expiringSoon: 1 });
    expect(before.locations[0]!.shelves[1]!.tiles).toHaveLength(2); // the input is untouched
  });

  it('merges with the same product and date at the destination (quantities add up)', () => {
    const after = applyMove(home(), 100, { toLocationId: 1, toShelfId: 11 });
    const target = after.locations[0]!.shelves[1]!.tiles;
    expect(target.find((t) => t.stockItemId === 101)?.quantity).toBe(5);
    expect(target.find((t) => t.stockItemId === 100)).toBeUndefined();
    expect(after.locations[0]!.shelves[0]!.tiles).toEqual([]);
  });

  it('does not merge a different expiry date', () => {
    const base = home();
    base.locations[0]!.shelves[1]!.tiles[0] = tile(101, 7, 3, '2026-12-31');
    const after = applyMove(base, 100, { toLocationId: 1, toShelfId: 11 });
    expect(after.locations[0]!.shelves[1]!.tiles.filter((t) => t.productId === 7)).toHaveLength(2);
  });

  it('sends a line to the tray of another furniture and recounts both', () => {
    const after = applyMove(home(), 101, { toLocationId: 2, toShelfId: null });
    expect(after.locations[1]!.unshelved.map((t) => t.stockItemId)).toEqual([103, 101]);
    expect(after.locations[0]!.counts.units).toBe(3);
    expect(after.locations[1]!.counts).toEqual({ products: 2, units: 7, expiringSoon: 0 });
  });

  it('returns the very same object for a drop on the origin or an unknown line', () => {
    const base = home();
    expect(applyMove(base, 100, { toLocationId: 1, toShelfId: 10 })).toBe(base);
    expect(applyMove(base, 999, { toLocationId: 1, toShelfId: 10 })).toBe(base);
  });
});
