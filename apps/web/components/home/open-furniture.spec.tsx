import type { HomeLocationDto, HomeShelfDto, HomeTileDto } from '@inventaire/shared';
import { DndContext } from '@dnd-kit/core';
import { render as baseRender, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpenFurniture } from './OpenFurniture';
import { scanHref } from './ShelfRow';

/** The tiles are draggable: like on the page, they live inside a drag-and-drop context. */
// No sensors: a plain click must not start a drag here.
const render = (ui: ReactElement) => baseRender(<DndContext sensors={[]}>{ui}</DndContext>);

const tile = (
  id: number,
  name: string,
  quantity: number,
  imageUrl: string | null = null,
): HomeTileDto => ({
  stockItemId: id,
  productId: id * 10,
  name,
  brand: null,
  imageUrl,
  category: { id: 1, name: 'Boissons', icon: 'milk' },
  quantity,
  expiryDate: null,
  expiry: null,
});
const shelf = (
  id: number,
  name: string,
  kind: 'rack' | 'plain',
  tiles: HomeTileDto[] = [],
): HomeShelfDto => ({
  id,
  name,
  kind,
  tiles,
});
const fridge = (over: Partial<HomeLocationDto> = {}): HomeLocationDto => ({
  id: 2,
  name: 'Frigo',
  kind: 'fridge',
  icon: 'refrigerator',
  counts: { products: 1, units: 3, expiringSoon: 0 },
  shelves: [
    shelf(21, 'Étagère 1', 'plain'),
    shelf(22, 'Étagère 2', 'rack', [tile(1, 'Lait', 3, '/api/images/lait.webp')]),
    shelf(23, 'Bac à légumes', 'plain'),
  ],
  unshelved: [],
  ...over,
});

describe('OpenFurniture', () => {
  it('stacks the shelves in the order received, the tray last', () => {
    render(<OpenFurniture location={fridge()} />);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Étagère 1', 'Étagère 2', 'Bac à légumes', 'Non rangé']);
  });

  it('draws the posts of a rack and a plain board', () => {
    const { container } = render(<OpenFurniture location={fridge()} />);
    const boards = [...container.querySelectorAll('[data-shelf-kind]')].map((b) =>
      b.getAttribute('data-shelf-kind'),
    );
    expect(boards).toEqual(['plain', 'rack', 'plain']);
  });

  it('shows a photo tile with its amber quantity, and a glyph when there is no photo', () => {
    const location = fridge({
      shelves: [
        shelf(22, 'Étagère 2', 'plain', [
          tile(1, 'Lait', 3, '/api/images/lait.webp'),
          tile(2, 'Eau', 6),
        ]),
      ],
    });
    const { container } = render(<OpenFurniture location={location} />);
    const section = screen.getByRole('region', { name: 'Étagère 2' });
    const milk = within(section).getByRole('button', { name: 'Lait, quantité 3' });
    expect(milk.querySelector('img')).toHaveAttribute('src', '/api/images/lait.webp');
    expect(within(milk).getByText('3')).toHaveClass('bg-amber');
    const water = within(section).getByRole('button', { name: 'Eau, quantité 6' });
    expect(water.querySelector('img')).toBeNull();
    expect(water.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('scrolls a full shelf horizontally', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => tile(i + 1, `P${i}`, 1));
    render(
      <OpenFurniture location={fridge({ shelves: [shelf(22, 'Étagère 2', 'plain', tiles)] })} />,
    );
    const row = within(screen.getByRole('region', { name: 'Étagère 2' })).getByRole('list');
    expect(row).toHaveClass('overflow-x-auto');
    expect(row.children).toHaveLength(12);
  });

  it('shows an empty shelf as « Vide » with a + that opens the scanner on that furniture and shelf', () => {
    render(<OpenFurniture location={fridge()} />);
    const empty = screen.getByRole('region', { name: 'Étagère 1' });
    expect(within(empty).getByText('Vide')).toBeInTheDocument();
    expect(
      within(empty).getByRole('link', { name: 'Ajouter un produit sur Étagère 1' }),
    ).toHaveAttribute('href', '/?lieu=2&etagere=21');
    expect(
      within(screen.getByRole('region', { name: 'Étagère 2' })).queryByText('Vide'),
    ).toBeNull();
  });

  it('shows the « Non rangé » tray with its products and a + for the furniture alone', () => {
    render(<OpenFurniture location={fridge({ unshelved: [tile(5, 'Beurre', 2)] })} />);
    const tray = screen.getByRole('region', { name: 'Non rangé' });
    expect(within(tray).getByRole('button', { name: 'Beurre, quantité 2' })).toBeInTheDocument();
    expect(
      within(tray).getByRole('link', { name: 'Ajouter un produit non rangé' }),
    ).toHaveAttribute('href', '/?lieu=2');
  });

  it('says the tray is empty', () => {
    render(<OpenFurniture location={fridge()} />);
    expect(screen.getByText('Rien de non rangé.')).toBeInTheDocument();
  });

  it('hands the tapped tile to the panel', async () => {
    const onSelect = vi.fn();
    render(<OpenFurniture location={fridge()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lait, quantité 3' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stockItemId: 1, name: 'Lait' }),
    );
  });

  it('builds the scanner link', () => {
    expect(scanHref(2)).toBe('/?lieu=2');
    expect(scanHref(2, 21)).toBe('/?lieu=2&etagere=21');
  });
});
