import type { HomeLocationDto, HomeResponse } from '@inventaire/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => '/inventaire',
}));
vi.mock('../../lib/stock-api', () => ({ fetchCategories: async () => [] }));
import { FurnitureCard } from './FurnitureCard';
import { HomeView } from './HomeView';

const place = (
  id: number,
  name: string,
  kind: HomeLocationDto['kind'],
  products: number,
  expiringSoon = 0,
): HomeLocationDto => ({
  id,
  name,
  kind,
  icon: 'x',
  counts: { products, units: products * 2, expiringSoon },
  shelves: [],
  unshelved: [],
});

const home: HomeResponse = {
  locations: [
    place(1, 'Garde-manger', 'pantry', 5),
    place(2, 'Frigo', 'fridge', 1, 2),
    place(3, 'Congélateur', 'freezer', 0),
    place(4, 'Cave', 'cellar', 3, 1),
  ],
};

describe('HomeView', () => {
  it('draws the four pieces of furniture, named, each with its drawing and a link', async () => {
    render(<HomeView load={async () => home} />);
    const links = await screen.findAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/inventaire/1',
      '/inventaire/2',
      '/inventaire/3',
      '/inventaire/4',
    ]);
    for (const name of ['Garde-manger', 'Frigo', 'Congélateur', 'Cave']) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('uses 2 columns on a phone and 4 on a computer', async () => {
    render(<HomeView load={async () => home} />);
    const grid = (await screen.findAllByRole('list'))[0]!;
    expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-4');
  });

  it('totals the articles and units in the indigo header', async () => {
    render(<HomeView load={async () => home} />);
    expect(await screen.findByText('9 articles · 18 unités')).toBeInTheDocument();
  });

  it('shows an error when the house cannot be loaded', async () => {
    render(
      <HomeView
        load={async () => {
          throw new Error('x');
        }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la maison');
  });
});

describe('FurnitureCard', () => {
  it('counts the articles, with the plural', () => {
    const { rerender } = render(<FurnitureCard location={place(1, 'Frigo', 'fridge', 1)} />);
    expect(screen.getByText('1 article')).toBeInTheDocument();
    rerender(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4)} />);
    expect(screen.getByText('4 articles')).toBeInTheDocument();
  });

  it('shows the amber « bientôt périmés » badge only when there are some', () => {
    const { rerender } = render(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4, 0)} />);
    expect(screen.queryByText(/bientôt périmé/)).toBeNull();
    rerender(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4, 1)} />);
    expect(screen.getByText('1 bientôt périmé')).toBeInTheDocument();
    rerender(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4, 3)} />);
    expect(screen.getByText('3 bientôt périmés')).toBeInTheDocument();
  });

  it('is surrounded in amber when highlighted', () => {
    render(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4)} highlighted />);
    expect(screen.getByRole('link')).toHaveClass('ring-amber');
  });

  it('draws the furniture from its kind, not its name', () => {
    render(<FurnitureCard location={place(9, 'Mon réfrigérateur', 'fridge', 0)} />);
    expect(screen.getByRole('img', { name: 'Frigo' })).toBeInTheDocument();
  });
});
