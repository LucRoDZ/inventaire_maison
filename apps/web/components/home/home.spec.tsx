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
      const link = screen.getByRole('link', { name: new RegExp(`^${name}`) });
      expect(link.querySelector('.fx-card-stage > svg')).not.toBeNull();
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
    const { container } = render(
      <FurnitureCard location={place(9, 'Mon réfrigérateur', 'fridge', 0)} />,
    );
    expect(container.querySelector('.fx-card-stage')).toHaveAttribute('data-kind', 'fridge');
    expect(container.querySelectorAll('.fx-card-door')).toHaveLength(1);
  });

  it('is named by its text alone, the name first, with or without the badge', () => {
    const { rerender } = render(<FurnitureCard location={place(2, 'Frigo', 'fridge', 4)} />);
    expect(screen.getByRole('link', { name: /^Frigo/ })).toHaveAccessibleName(
      /^Frigo\s*4 articles$/,
    );
    rerender(<FurnitureCard location={place(2, 'Frigo', 'fridge', 4, 2)} />);
    expect(screen.getByRole('link', { name: /^Frigo/ })).toHaveAccessibleName(
      /^Frigo\s*4 articles\s*2 bientôt périmés$/,
    );
  });

  it('hides the drawing, the doors and the light from assistive technology', () => {
    const { container } = render(<FurnitureCard location={place(2, 'Frigo', 'fridge', 4)} />);
    expect(screen.queryByRole('img')).toBeNull();
    const scenery = container.querySelectorAll('svg, .fx-card-door, .fx-card-light');
    expect(scenery).toHaveLength(3);
    for (const piece of scenery) expect(piece).toHaveAttribute('aria-hidden', 'true');
    // The link is the only focusable element: no button inside it.
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(1);
  });

  it('closes each furniture with its own door(s), placed on the body of the drawing', () => {
    const doors = (kind: HomeLocationDto['kind']) => {
      const { container, unmount } = render(<FurnitureCard location={place(1, 'X', kind, 0)} />);
      const found = [...container.querySelectorAll<HTMLElement>('.fx-card-door')].map((door) => ({
        hinge: door.getAttribute('data-hinge'),
        left: door.style.left,
        width: door.style.width,
        face: door.querySelectorAll('.fx-door-face .fx-handle, .fx-door-face .fx-gloss').length,
      }));
      unmount();
      return found;
    };
    expect(doors('fridge')).toEqual([{ hinge: 'left', left: '21.7%', width: '56.7%', face: 2 }]);
    expect(doors('freezer')).toEqual([{ hinge: 'left', left: '13.3%', width: '73.3%', face: 2 }]);
    expect(doors('pantry')).toEqual([
      { hinge: 'left', left: '11.7%', width: '38.35%', face: 2 },
      { hinge: 'right', left: '50.05%', width: '38.35%', face: 2 },
    ]);
    expect(doors('cellar')).toEqual([
      { hinge: 'left', left: '8.3%', width: '41.65%', face: 2 },
      { hinge: 'right', left: '49.95%', width: '41.65%', face: 2 },
    ]);
    expect(doors('other')).toEqual(doors('pantry'));
  });

  it('leaves the door ajar (data-match) only when the search finds something inside', () => {
    const { rerender } = render(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4)} />);
    expect(screen.getByRole('link')).not.toHaveAttribute('data-match');
    expect(screen.getByRole('link')).toHaveClass('fx-card');
    rerender(<FurnitureCard location={place(1, 'Frigo', 'fridge', 4)} highlighted />);
    expect(screen.getByRole('link')).toHaveAttribute('data-match', 'true');
    expect(screen.getByRole('link')).toHaveClass('ring-amber', 'ring-4');
  });
});
