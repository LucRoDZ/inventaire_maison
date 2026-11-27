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
  counts: { products: 1, units: 3, expired: 0, soon: 0 },
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

  it('shows a photo tile with its indigo quantity, and a glyph when there is no photo', () => {
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
    expect(within(milk).getByText('3')).toHaveClass('bg-indigo');
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
    ).toHaveAttribute('href', '/scanner?lieu=2&etagere=21');
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
    ).toHaveAttribute('href', '/scanner?lieu=2');
  });

  it('says the tray is empty', () => {
    render(<OpenFurniture location={fridge()} />);
    expect(screen.getByText('Rien de non rangé')).toBeInTheDocument();
  });

  it('hands the tapped tile to the panel', async () => {
    const onSelect = vi.fn();
    render(<OpenFurniture location={fridge()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lait, quantité 3' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stockItemId: 1, name: 'Lait' }),
    );
  });

  it('lives in the shell of its kind: door(s), light, and every shelf inside the body', () => {
    const { container, unmount } = render(<OpenFurniture location={fridge()} />);
    const scene = container.querySelector('.fx-scene.open-furniture')!;
    expect(scene).toHaveAttribute('data-kind', 'fridge');
    expect(scene.querySelectorAll('.fx-door')).toHaveLength(1);
    expect(scene.querySelectorAll('.fx-light')).toHaveLength(1);
    const body = scene.querySelector('.fx-body')!;
    for (const name of ['Étagère 1', 'Étagère 2', 'Bac à légumes', 'Non rangé']) {
      expect(body).toContainElement(screen.getByRole('region', { name }));
    }
    unmount();
    render(<OpenFurniture location={fridge({ kind: 'cellar' })} />);
    expect(document.querySelector('.fx-scene')).toHaveAttribute('data-kind', 'cellar');
    expect(document.querySelectorAll('.fx-door')).toHaveLength(2);
  });

  it('draws every shelf of the fridge on the same glass board, whatever its name', () => {
    const location = fridge({
      shelves: [
        shelf(21, 'Étagère 1', 'plain'),
        shelf(23, 'Bac à légumes 1', 'plain'),
        shelf(24, 'Balconnet', 'plain'),
        shelf(25, 'Tiroir du bas', 'plain'),
      ],
    });
    const { container } = render(<OpenFurniture location={location} />);
    const boards = [...container.querySelectorAll('[data-shelf-kind] > div:first-child')];
    expect(boards).toHaveLength(4);
    for (const board of boards) expect(board.className).toBe('fx-glass-edge');
    expect(container.querySelectorAll('.fx-spot, .fx-drawer')).toHaveLength(0);
  });

  it('keeps the posts of a rack under a glass board', () => {
    const { container } = render(<OpenFurniture location={fridge()} />);
    const rack = container.querySelector('[data-shelf-kind="rack"]')!;
    expect(rack.querySelector('.fx-glass-edge')).not.toBeNull();
    expect(rack.querySelectorAll('span')).toHaveLength(4);
    expect(rack).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the indigo board in the pantry, the cellar and any other furniture, without spots', () => {
    for (const kind of ['pantry', 'cellar', 'other'] as const) {
      const { container, unmount } = render(<OpenFurniture location={fridge({ kind })} />);
      const boards = [...container.querySelectorAll('[data-shelf-kind] > div:first-child')];
      expect(boards).toHaveLength(3);
      for (const board of boards) expect(board).toHaveClass('bg-indigo', 'h-2');
      expect(
        container.querySelector('[data-shelf-kind="rack"]')!.querySelectorAll('span'),
      ).toHaveLength(4);
      // The only light is the thin bar along the top of the body: no spot over a shelf.
      expect(container.querySelectorAll('.fx-spot')).toHaveLength(0);
      expect(container.querySelectorAll('.fx-light')).toHaveLength(1);
      expect(container.querySelector('.fx-glass-edge')).toBeNull();
      unmount();
    }
  });

  it('draws no board under the drawers of the freezer, and no spot', () => {
    const { container } = render(<OpenFurniture location={fridge({ kind: 'freezer' })} />);
    expect(container.querySelectorAll('.fx-glass-edge, .fx-board')).toHaveLength(0);
    expect(container.querySelector('.fx-spot')).toBeNull();
    // The kind of each shelf is still written, on the drawer itself.
    expect(
      [...container.querySelectorAll('section.fx-drawer[data-shelf-kind]')].map((d) =>
        d.getAttribute('data-shelf-kind'),
      ),
    ).toEqual(['plain', 'rack', 'plain']);
  });

  describe('a freezer of three drawers', () => {
    const freezer = (): HomeLocationDto =>
      fridge({
        id: 3,
        name: 'Congélateur',
        kind: 'freezer',
        shelves: [
          shelf(31, 'Tiroir 1', 'plain', [tile(1, 'Glace', 2), tile(2, 'Pizza', 4)]),
          shelf(32, 'Tiroir 2', 'plain', [tile(3, 'Poisson', 1)]),
          shelf(33, 'Tiroir 3', 'plain'),
        ],
        unshelved: [tile(4, 'Frites', 1)],
      });

    it('draws each shelf as a drawer, in order, the tray last and not a drawer', () => {
      const { container } = render(<OpenFurniture location={freezer()} />);
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Tiroir 1',
        'Tiroir 2',
        'Tiroir 3',
        'Non rangé',
      ]);
      const drawers = [...container.querySelectorAll<HTMLElement>('.fx-drawer')];
      expect(drawers.map((d) => d.getAttribute('aria-label'))).toEqual([
        'Tiroir 1',
        'Tiroir 2',
        'Tiroir 3',
      ]);
      // They slide in one after the other: each one carries its rank.
      expect(drawers.map((d) => d.style.getPropertyValue('--i'))).toEqual(['0', '1', '2']);
      expect(screen.getByRole('region', { name: 'Non rangé' })).not.toHaveClass('fx-drawer');
      expect(
        [...container.querySelectorAll('[data-shelf-kind]')].map((b) =>
          b.getAttribute('data-shelf-kind'),
        ),
      ).toEqual(['plain', 'plain', 'plain']);
    });

    it('writes the name and the number of articles on one line, nothing when empty', () => {
      render(<OpenFurniture location={freezer()} />);
      const counts = ['Tiroir 1', 'Tiroir 2', 'Tiroir 3'].map(
        (name) =>
          within(screen.getByRole('region', { name })).queryByText(/^\d+ articles?$/)
            ?.textContent ?? null,
      );
      expect(counts).toEqual(['2 articles', '1 article', null]);
      const line = within(screen.getByRole('region', { name: 'Tiroir 1' }))
        .getByRole('heading', { level: 3 })
        .closest('.fx-line')!;
      expect(line).toHaveTextContent('Tiroir 12 articles');
      expect(screen.queryByText('0 article')).toBeNull();
    });

    it('counts a product once when it lies on two lines of the same drawer', () => {
      const twice = freezer();
      twice.shelves[0]!.tiles = [
        tile(1, 'Glace', 2),
        { ...tile(5, 'Glace', 1), productId: 10 },
        tile(2, 'Pizza', 4),
      ];
      render(<OpenFurniture location={twice} />);
      expect(
        within(screen.getByRole('region', { name: 'Tiroir 1' })).getByText('2 articles'),
      ).toBeInTheDocument();
    });

    it('keeps every drawer open: content visible, nothing to expand, empty one still a target', () => {
      const { container } = render(<OpenFurniture location={freezer()} />);
      const first = screen.getByRole('region', { name: 'Tiroir 1' });
      expect(within(first).getByRole('button', { name: 'Glace, quantité 2' })).toBeVisible();
      expect(within(first).getByRole('button', { name: 'Pizza, quantité 4' })).toBeVisible();
      expect(
        within(screen.getByRole('region', { name: 'Tiroir 2' })).getByRole('button', {
          name: 'Poisson, quantité 1',
        }),
      ).toBeVisible();
      expect(container.querySelector('[aria-expanded], details, summary')).toBeNull();
      const empty = screen.getByRole('region', { name: 'Tiroir 3' });
      expect(within(empty).getByText('Vide')).toBeInTheDocument();
      expect(
        within(empty).getByRole('link', { name: 'Ajouter un produit sur Tiroir 3' }),
      ).toHaveAttribute('href', '/scanner?lieu=3&etagere=33');
      // The only buttons are the tiles.
      expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    it('has no frost and no light: no dotted edging, no halo', () => {
      const { container } = render(<OpenFurniture location={freezer()} />);
      expect(container.querySelector('.fx-frost')).toBeNull();
      expect(container.querySelector('.fx-light')).toBeNull();
    });

    it('never draws a dotted outline inside a drawer', () => {
      const { container } = render(<OpenFurniture location={freezer()} />);
      const empty = screen.getByRole('region', { name: 'Tiroir 3' });
      expect(empty.querySelector('.fx-zone-empty')).not.toBeNull();
      expect(container.querySelector('.border-dashed')).toBeNull();
    });

    it('follows the kind of the furniture, not the names: a fridge has no drawer', () => {
      const { container } = render(
        <OpenFurniture location={{ ...freezer(), kind: 'fridge', name: 'Congélateur' }} />,
      );
      expect(container.querySelector('.fx-drawer')).toBeNull();
      expect(screen.queryByText(/^\d+ articles?$/)).toBeNull();
    });
  });

  it('piles decorative cards behind a tile: none for 1 unit, 4 at most from 5 units', () => {
    const quantities = [1, 2, 3, 5, 6, 12];
    const location = fridge({
      shelves: [
        shelf(
          22,
          'Étagère 2',
          'plain',
          quantities.map((quantity, i) => tile(i + 1, `P${quantity}`, quantity)),
        ),
      ],
    });
    render(<OpenFurniture location={location} />);
    const piles = quantities.map((quantity) => {
      const button = screen.getByRole('button', { name: `P${quantity}, quantité ${quantity}` });
      const pile = button.parentElement!;
      expect(pile).toHaveClass('fx-pile');
      // Around the button, never inside it.
      expect(button.querySelector('.fx-pile-card')).toBeNull();
      const cards = [...pile.querySelectorAll<HTMLElement>(':scope > .fx-pile-card')];
      for (const card of cards) {
        expect(card).toHaveAttribute('aria-hidden', 'true');
        expect(card.tagName).toBe('SPAN');
      }
      expect(cards.map((card) => card.style.getPropertyValue('--i'))).toEqual(
        cards.map((_, k) => String(k + 1)),
      );
      return cards.length;
    });
    expect(piles).toEqual([0, 1, 2, 4, 4, 4]);
  });

  it('keeps the button of a tile: same name, square sized by its shelf, one per line of stock', () => {
    const location = fridge({
      shelves: [shelf(22, 'Étagère 2', 'plain', [tile(1, 'Lait', 9), tile(2, 'Eau', 1)])],
    });
    render(<OpenFurniture location={location} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Lait, quantité 9',
      'Eau, quantité 1',
    ]);
    for (const button of buttons) expect(button).toHaveClass('fx-tile', 'shrink-0');
  });

  it('draws no pile behind a tile faded by the filter', () => {
    const location = fridge({
      shelves: [shelf(22, 'Étagère 2', 'plain', [tile(1, 'Lait', 9), tile(2, 'Eau', 4)])],
    });
    const { container } = render(
      <OpenFurniture location={location} isDimmed={(t) => t.name === 'Lait'} />,
    );
    expect(container.querySelectorAll('.fx-pile-card')).toHaveLength(3);
    const faded = screen.getByRole('button', { name: 'Lait, quantité 9' });
    expect(faded).toHaveClass('opacity-30');
    expect(faded.parentElement!.querySelectorAll('.fx-pile-card')).toHaveLength(0);
  });

  it('has no « Ouvrir » or « Fermer » button: the door is a transition, not a control', () => {
    render(<OpenFurniture location={fridge()} />);
    expect(screen.queryByRole('button', { name: /ouvrir|fermer/i })).toBeNull();
    // The only buttons are the tiles.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Lait, quantité 3',
    ]);
  });

  it('gives every shelf the same structure, empty or full: zone on top, name and board below', () => {
    const { container } = render(<OpenFurniture location={fridge()} />);
    for (const name of ['Étagère 1', 'Étagère 2', 'Bac à légumes']) {
      const section = screen.getByRole('region', { name });
      expect(section.parentElement).toHaveClass('fx-row');
      expect(section.children[0]).toHaveClass('fx-zone');
      const line = section.querySelector(':scope > .fx-line')!;
      expect(within(line as HTMLElement).getByRole('heading', { level: 3 })).toHaveTextContent(
        name,
      );
      expect(line.querySelector('[data-shelf-kind]')).not.toBeNull();
    }
    const empty = screen.getByRole('region', { name: 'Étagère 1' });
    const zone = empty.querySelector('.fx-zone')!;
    expect(zone).toHaveClass('fx-zone-empty');
    expect(within(zone as HTMLElement).getByText('Vide')).toHaveClass('text-help');
    expect(container.querySelectorAll('.fx-shelves > .fx-row')).toHaveLength(3);
  });

  it('tells the stylesheet how many shelves share the height, and what the tray takes', () => {
    const { container, unmount } = render(<OpenFurniture location={fridge()} />);
    const shelves = container.querySelector<HTMLElement>('.fx-shelves')!;
    expect(shelves.style.getPropertyValue('--n')).toBe('3');
    expect(shelves.style.getPropertyValue('--fx-slots')).toBe('3');
    expect(shelves.style.getPropertyValue('--fx-tray-fixed')).toBe('56px');
    unmount();
    const filled = render(
      <OpenFurniture location={fridge({ unshelved: [tile(5, 'Beurre', 2)] })} />,
    );
    const next = filled.container.querySelector<HTMLElement>('.fx-shelves')!;
    expect(next.style.getPropertyValue('--fx-slots')).toBe('4');
    expect(next.style.getPropertyValue('--fx-tray-fixed')).toBe('0px');
  });

  it('keeps the « Non rangé » tray a drop zone: a thin line empty, a shelf row with products', () => {
    const { unmount } = render(<OpenFurniture location={fridge()} />);
    expect(screen.getByRole('region', { name: 'Non rangé' }).parentElement).toHaveClass(
      'fx-tray-row',
      'fx-tray-empty',
    );
    unmount();
    render(<OpenFurniture location={fridge({ unshelved: [tile(5, 'Beurre', 2)] })} />);
    const tray = screen.getByRole('region', { name: 'Non rangé' });
    expect(tray.parentElement).toHaveClass('fx-tray-row');
    expect(tray.parentElement).not.toHaveClass('fx-tray-empty');
    expect(within(tray).getByRole('heading', { level: 3 })).toHaveTextContent('Non rangé');
  });

  it('builds the scanner link', () => {
    expect(scanHref(2)).toBe('/scanner?lieu=2');
    expect(scanHref(2, 21)).toBe('/scanner?lieu=2&etagere=21');
  });
});
