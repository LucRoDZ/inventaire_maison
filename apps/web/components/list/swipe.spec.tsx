import type { StockAdjustInput, StockListItemDto } from '@inventaire/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListView } from './ListView';
import { outOfStockStore } from '../../lib/zero-stock';

const item: StockListItemDto = {
  id: 1,
  quantity: 2,
  expiryDate: null,
  expiry: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  product: {
    id: 10,
    name: 'Lait',
    brand: null,
    sizeLabel: null,
    imageUrl: null,
    categoryGuessed: false,
  },
  category: { id: 1, name: 'Boissons', icon: 'package' },
  location: { id: 10, name: 'Frigo' },
  shelf: null,
};

function setup() {
  const adjust = vi.fn(
    async (input: StockAdjustInput) => ({ item: null, movement: { input } }) as never,
  );
  render(
    <ListView
      api={{
        fetchStock: async () => ({ items: [item], counts: [] }),
        fetchLocations: async () => [],
        fetchCategories: async () => [
          {
            id: 1,
            name: 'Boissons',
            icon: 'package',
            sortOrder: 1,
            isFallback: false,
            shelfLifeDays: null,
          },
        ],
        adjust,
      }}
    />,
  );
  return adjust;
}

const swipe = (target: HTMLElement, dx: number) => {
  const at = (x: number) => ({ pointerId: 1, isPrimary: true, clientX: x, clientY: 50 });
  fireEvent.pointerDown(target, at(200));
  fireEvent.pointerMove(target, at(200 + dx));
  fireEvent.pointerUp(target, at(200 + dx));
};

const rowOf = async () => {
  const heading = await screen.findByText('Lait');
  return heading.closest('[data-swipe-row]')!.lastElementChild as HTMLElement;
};

describe('List: swipe', () => {
  it('records « Consommé » when swiped to the right, with the 5 s undo', async () => {
    const adjust = setup();
    swipe(await rowOf(), 100);
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(
        expect.objectContaining({ delta: -1, reason: 'consumed' }),
      ),
    );
    expect(await screen.findByText(/Consommé : 1 × Lait/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Annuler/ })).toBeInTheDocument();
  });

  it('records « Jeté » when swiped to the left, and the undo carries the reason', async () => {
    const adjust = setup();
    swipe(await rowOf(), -100);
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ delta: -1, reason: 'wasted' })),
    );
    expect(await screen.findByText(/Jeté : 1 × Lait/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    await waitFor(() =>
      expect(adjust).toHaveBeenLastCalledWith(
        expect.objectContaining({ delta: 1, reason: 'wasted' }),
      ),
    );
  });

  it('leaves the − button as the keyboard path', async () => {
    const adjust = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ reason: 'consumed' })),
    );
    expect(await screen.findByRole('button', { name: 'Jeté' })).toBeInTheDocument();
  });
});

describe('List: swipe and out of stock', () => {
  it('invites after a swipe that took the last unit', async () => {
    const adjust = vi.fn(
      async () => ({ item: null, movement: {}, productTotal: 0, onShoppingList: false }) as never,
    );
    render(
      <ListView
        api={{
          fetchStock: async () => ({ items: [item], counts: [] }),
          fetchLocations: async () => [],
          fetchCategories: async () => [
            {
              id: 1,
              name: 'Boissons',
              icon: 'package',
              sortOrder: 1,
              isFallback: false,
              shelfLifeDays: null,
            },
          ],
          adjust,
        }}
      />,
    );
    swipe(await rowOf(), 100);
    await waitFor(() => expect(outOfStockStore.get()?.productId).toBe(10));
    outOfStockStore.clear();
  });
});
