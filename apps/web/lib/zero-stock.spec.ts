import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteAfterRemoval, outOfStockInvite, outOfStockStore } from './zero-stock';

const product = { id: 7, name: 'Lait' };

afterEach(() => outOfStockStore.clear());

describe('outOfStockInvite', () => {
  it('invites after the last unit of the household', () => {
    expect(outOfStockInvite({ productTotal: 0, onShoppingList: false }, product)).toEqual({
      productId: 7,
      name: 'Lait',
      quantity: 1,
    });
  });

  it('uses the usual quantity when known', () => {
    expect(
      outOfStockInvite({ productTotal: 0, onShoppingList: false }, { ...product, usualQuantity: 3 })
        ?.quantity,
    ).toBe(3);
  });

  it('does not invite while stock remains elsewhere', () => {
    expect(outOfStockInvite({ productTotal: 2, onShoppingList: false }, product)).toBeNull();
  });

  it('does not invite when the product is already on the list (threshold line included)', () => {
    expect(outOfStockInvite({ productTotal: 0, onShoppingList: true }, product)).toBeNull();
  });

  it('does not invite without a server answer', () => {
    expect(outOfStockInvite(undefined, product)).toBeNull();
    expect(inviteAfterRemoval(null, product)).toBe(false);
    expect(outOfStockStore.get()).toBeNull();
  });
});

describe('outOfStockStore', () => {
  it('shows, notifies and dismisses for the matching product only', () => {
    const listener = vi.fn();
    const off = outOfStockStore.subscribe(listener);
    expect(inviteAfterRemoval({ productTotal: 0, onShoppingList: false }, product)).toBe(true);
    expect(outOfStockStore.get()?.productId).toBe(7);
    outOfStockStore.dismissFor(8);
    expect(outOfStockStore.get()).not.toBeNull();
    outOfStockStore.dismissFor(7);
    expect(outOfStockStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('keeps one invitation at a time', () => {
    outOfStockStore.show({ productId: 1, name: 'A', quantity: 1 });
    outOfStockStore.show({ productId: 2, name: 'B', quantity: 1 });
    expect(outOfStockStore.get()?.productId).toBe(2);
  });
});
