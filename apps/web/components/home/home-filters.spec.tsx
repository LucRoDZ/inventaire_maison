import type { CategoryDto, HomeLocationDto, HomeResponse } from '@inventaire/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchField } from './SearchField';
import { HomeView } from './HomeView';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => '/inventaire',
}));
const categories: CategoryDto[] = [
  { id: 1, name: 'Laitier', icon: 'milk', sortOrder: 1, isFallback: false },
  { id: 2, name: 'Boissons', icon: 'cup-soda', sortOrder: 2, isFallback: false },
];
vi.mock('../../lib/stock-api', () => ({ fetchCategories: async () => categories }));

beforeEach(() => {
  search = '';
  replace.mockClear();
});

const stocked = (
  id: number,
  name: string,
  product: string,
  categoryId: number,
  kind: HomeLocationDto['kind'],
): HomeLocationDto => ({
  id,
  name,
  kind,
  icon: 'x',
  counts: { products: 1, units: 1, expiringSoon: 0 },
  shelves: [],
  unshelved: [
    {
      stockItemId: id,
      productId: id,
      name: product,
      brand: null,
      imageUrl: null,
      category: { id: categoryId, name: 'C', icon: 'milk' },
      quantity: 1,
      expiryDate: null,
      expiry: null,
    },
  ],
});
const house: HomeResponse = {
  locations: [
    stocked(1, 'Frigo', 'Lait', 1, 'fridge'),
    stocked(2, 'Cave', 'Vin rouge', 2, 'cellar'),
  ],
};

describe('SearchField', () => {
  it('is named « Nom ou marque » and gives each typed text', async () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Nom ou marque' }), 'l');
    expect(onChange).toHaveBeenLastCalledWith('l');
  });
});

describe('HomeView with a filter', () => {
  it('rings only the furniture that holds a match, by text', async () => {
    search = 'q=lait';
    render(<HomeView load={async () => house} />);
    expect(await screen.findByRole('link', { name: /^Frigo/ })).toHaveClass('ring-amber');
    expect(screen.getByRole('link', { name: /^Cave/ })).not.toHaveClass('ring-amber');
  });

  it('rings by category', async () => {
    search = 'cat=2';
    render(<HomeView load={async () => house} />);
    expect(await screen.findByRole('link', { name: /^Cave/ })).toHaveClass('ring-amber');
    expect(screen.getByRole('link', { name: /^Frigo/ })).not.toHaveClass('ring-amber');
  });

  it('rings the furniture of any of the chosen categories', async () => {
    search = 'cat=1,2';
    render(<HomeView load={async () => house} />);
    expect(await screen.findByRole('link', { name: /^Cave/ })).toHaveClass('ring-amber');
    expect(screen.getByRole('link', { name: /^Frigo/ })).toHaveClass('ring-amber');
  });

  it('rings nothing without a filter', async () => {
    render(<HomeView load={async () => house} />);
    for (const link of await screen.findAllByRole('link'))
      expect(link).not.toHaveClass('ring-amber');
  });

  it('keeps the filter in the link that opens a furniture', async () => {
    search = 'q=lait&cat=1';
    render(<HomeView load={async () => house} />);
    expect(await screen.findByRole('link', { name: /^Frigo/ })).toHaveAttribute(
      'href',
      '/inventaire/1?q=lait&cat=1',
    );
  });
});
