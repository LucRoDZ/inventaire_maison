import type {
  CategoryDto,
  LocationDto,
  StockAdjustInput,
  StockListItemDto,
  StockListResponse,
} from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { NO_FILTER, type HomeFilters } from '../../lib/home-filters';
import { ExpiryBadge, expiryLabel } from './ExpiryBadge';
import { ListView } from './ListView';
import { outOfStockStore } from '../../lib/zero-stock';

const categories: CategoryDto[] = [
  {
    id: 1,
    name: 'Boissons',
    icon: 'cup-soda',
    sortOrder: 1,
    isFallback: false,
    shelfLifeDays: null,
  },
  {
    id: 2,
    name: 'Produits laitiers et œufs',
    icon: 'milk',
    sortOrder: 2,
    isFallback: false,
    shelfLifeDays: null,
  },
  { id: 3, name: 'Autre', icon: 'package', sortOrder: 3, isFallback: true, shelfLifeDays: null },
];
const locations: LocationDto[] = [
  {
    id: 10,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    productCount: 0,
    sortOrder: 1,
    shelves: [],
  },
  {
    id: 11,
    name: 'Cave',
    kind: 'cellar',
    icon: 'wine',
    productCount: 0,
    sortOrder: 2,
    shelves: [],
  },
];

const line = (
  id: number,
  name: string,
  categoryId: number,
  quantity: number,
  over: Partial<StockListItemDto> = {},
): StockListItemDto => ({
  id,
  quantity,
  expiryDate: null,
  expiry: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  product: {
    id: id * 10,
    name,
    brand: null,
    sizeLabel: null,
    imageUrl: null,
    categoryGuessed: false,
  },
  category: {
    id: categoryId,
    name: categories.find((c) => c.id === categoryId)!.name,
    icon: 'package',
  },
  location: { id: 10, name: 'Frigo' },
  shelf: { id: 100, name: 'Étagère 2' },
  ...over,
});

const stock = (items: StockListItemDto[]): StockListResponse => ({
  items,
  counts: [
    { locationId: 10, products: items.length, units: items.reduce((n, i) => n + i.quantity, 0) },
    { locationId: 11, products: 0, units: 0 },
  ],
});

/** The fake server keeps the stock: a reload after a change returns what the change made. */
function renderList(
  items: StockListItemDto[],
  extra: Partial<NonNullable<React.ComponentProps<typeof ListView>['api']>> = {},
  filters: HomeFilters = NO_FILTER,
) {
  const onSummary = vi.fn();
  let current = items;
  const fetchStock = vi.fn(async () => stock(current));
  const adjust = vi.fn(async (input: StockAdjustInput) => {
    current = current.flatMap((l) =>
      l.product.id !== input.productId || l.expiryDate !== (input.expiryDate ?? null)
        ? [l]
        : l.quantity + input.delta <= 0
          ? []
          : [{ ...l, quantity: l.quantity + input.delta }],
    );
    return { item: null, movement: {} } as never;
  });
  const view = render(
    <ListView
      filters={filters}
      onSummary={onSummary}
      api={{
        fetchStock,
        adjust,
        fetchLocations: async () => locations,
        fetchCategories: async () => categories,
        ...extra,
      }}
    />,
  );
  const rerender = (next: HomeFilters) =>
    view.rerender(
      <ListView
        filters={next}
        onSummary={onSummary}
        api={{
          fetchStock,
          adjust,
          fetchLocations: async () => locations,
          fetchCategories: async () => categories,
          ...extra,
        }}
      />,
    );
  return { fetchStock, adjust, onSummary, rerender };
}

describe('ExpiryBadge', () => {
  it.each([
    [{ status: 'expired' } as const, 'Périmé'],
    [{ status: 'soon', days: 0 } as const, 'Aujourd’hui'],
    [{ status: 'soon', days: 1 } as const, 'J-1'],
    [{ status: 'soon', days: 3 } as const, 'J-3'],
  ])('writes %j as « %s »', (expiry, label) => {
    expect(expiryLabel(expiry)).toBe(label);
    render(<ExpiryBadge expiry={expiry} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows nothing without a status', () => {
    const { container } = render(<ExpiryBadge expiry={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ListView', () => {
  it('groups the lines by category in the order of the categories', async () => {
    renderList([line(1, 'Lait', 2, 3), line(2, 'Eau', 1, 6), line(3, 'Yaourt', 2, 1)]);
    const sections = await screen.findAllByRole('button', { expanded: true });
    expect(sections.map((s) => s.textContent)).toEqual([
      'Boissons (1)',
      'Produits laitiers et œufs (2)',
    ]);
    expect(screen.queryByText(/Autre \(/)).toBeNull();
  });

  it('collapses and expands a section', async () => {
    renderList([line(1, 'Lait', 2, 3)]);
    const section = await screen.findByRole('button', { name: /Produits laitiers/ });
    expect(screen.getByText('Lait')).toBeInTheDocument();
    await userEvent.click(section);
    expect(screen.queryByText('Lait')).toBeNull();
    expect(section).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the counters as a help line and gives each furniture its count', async () => {
    const { onSummary } = renderList([line(1, 'Lait', 2, 3), line(2, 'Eau', 1, 6)]);
    expect(await screen.findByText('2 articles · 9 unités')).toHaveClass('text-small');
    await waitFor(() =>
      expect(onSummary).toHaveBeenLastCalledWith({
        total: 2,
        locations: [
          { id: 10, name: 'Frigo', count: 2 },
          { id: 11, name: 'Cave', count: 0 },
        ],
      }),
    );
  });

  it('gives no summary before the furniture is loaded (a filter is never taken for stale)', async () => {
    const { onSummary } = renderList([line(1, 'Lait', 2, 3)], {
      fetchLocations: () => new Promise<LocationDto[]>(() => undefined),
    });
    expect(await screen.findByText('1 article · 3 unités')).toBeInTheDocument();
    expect(onSummary).not.toHaveBeenCalled();
  });

  it('sends the search and the order to the server, filters furniture and categories here', async () => {
    const items = [
      line(1, 'Lait', 2, 3),
      line(2, 'Eau', 1, 6),
      line(3, 'Vin', 1, 2, { location: { id: 11, name: 'Cave' } }),
    ];
    const { fetchStock, onSummary, rerender } = renderList(items);
    expect(await screen.findByText('3 articles · 11 unités')).toBeInTheDocument();
    rerender({ q: 'eau', categoryIds: [1], locationId: 10, sort: 'added', expiry: null });
    await waitFor(() => expect(fetchStock).toHaveBeenLastCalledWith({ q: 'eau', sort: 'added' }));
    // The fake server ignores the search: only the furniture and the category filter here.
    expect(await screen.findByText('1 article · 6 unités')).toBeInTheDocument();
    expect(screen.queryByText('Vin')).toBeNull();
    expect(screen.queryByText('Lait')).toBeNull();
    await waitFor(() =>
      expect(onSummary).toHaveBeenLastCalledWith({
        total: 2,
        locations: [
          { id: 10, name: 'Frigo', count: 1 },
          { id: 11, name: 'Cave', count: 1 },
        ],
      }),
    );
  });

  it('changes the quantity at once, with the manual reason and the line key', async () => {
    const { adjust } = renderList([line(1, 'Lait', 2, 3, { expiryDate: '2026-12-01' })]);
    const card = (await screen.findByText('Lait')).closest('article')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Ajouter une unité de Lait' }));
    expect(within(card).getByLabelText('Quantité')).toHaveTextContent('4');
    expect(adjust).toHaveBeenCalledWith({
      productId: 10,
      locationId: 10,
      shelfId: 100,
      expiryDate: '2026-12-01',
      delta: 1,
      reason: 'manual',
    });
  });

  it('records a removal as consumed, with Jeté and Annuler for the toast', async () => {
    const { adjust } = renderList([line(1, 'Lait', 2, 3, { expiryDate: '2026-12-01' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ delta: -1, reason: 'consumed' }));
    const toast = (await screen.findByText(/Consommé : 1 × Lait/)).closest('[role="status"]')!;
    await userEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Jeté' }));
    await waitFor(() =>
      expect(adjust).toHaveBeenLastCalledWith(
        expect.objectContaining({ delta: -1, reason: 'wasted', expiryDate: '2026-12-01' }),
      ),
    );
  });

  it('goes back to the old quantity and says so when the server refuses', async () => {
    const adjust = vi.fn(async () => {
      throw new ApiError(409, 'Stock insuffisant');
    });
    renderList([line(1, 'Lait', 2, 3)], { adjust });
    const card = (await screen.findByText('Lait')).closest('article')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Retirer une unité de Lait' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuffisant');
    expect(
      within(screen.getByText('Lait').closest('article')!).getByLabelText('Quantité'),
    ).toHaveTextContent('3');
  });

  it('removes the card at zero and restores it if the server refuses', async () => {
    const adjust = vi.fn(async () => {
      throw new ApiError(0, 'réseau');
    });
    renderList([line(1, 'Lait', 2, 1)], { adjust });
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vérifiez la connexion');
    expect(screen.getByText('Lait')).toBeInTheDocument();
  });

  it('makes the card disappear at zero when the server accepts', async () => {
    renderList([line(1, 'Lait', 2, 1)]);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    await waitFor(() => expect(screen.queryByText('Lait')).toBeNull());
  });

  it('shows the expiry badge on the card with its word', async () => {
    renderList([
      line(1, 'Lait', 2, 1, { expiry: { status: 'soon', days: 3 } }),
      line(2, 'Eau', 1, 1, { expiry: { status: 'expired' } }),
    ]);
    expect(await screen.findByText('J-3')).toBeInTheDocument();
    expect(screen.getByText('Périmé')).toBeInTheDocument();
  });

  it('shows the empty state with a way to the scanner', async () => {
    renderList([]);
    expect(await screen.findByText('Rien ici pour l’instant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scanner un produit' })).toHaveAttribute(
      'href',
      '/scanner',
    );
    expect(screen.getByText('0 article · 0 unité')).toBeInTheDocument();
  });

  it('says « Aucun résultat » when a search matches nothing', async () => {
    renderList([], {}, { ...NO_FILTER, q: 'zzz' });
    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Scanner un produit' })).toBeNull();
  });
});

describe('ListView batch edit', () => {
  const twoLines = () => [
    line(1, 'Lait', 2, 3, { expiryDate: '2026-12-01' }),
    line(2, 'Eau', 1, 2),
    line(3, 'Thé', 1, 1),
  ];

  async function select(...names: string[]) {
    await userEvent.click(await screen.findByRole('button', { name: 'Sélectionner' }));
    for (const name of names) {
      await userEvent.click(screen.getByRole('checkbox', { name: `Sélectionner ${name}` }));
    }
  }

  it('swaps the quantity buttons for checkboxes and counts what is ticked', async () => {
    renderList(twoLines());
    await select('Lait', 'Eau');
    expect(screen.queryByRole('button', { name: 'Retirer une unité de Lait' })).toBeNull();
    const bar = screen.getByRole('region', { name: 'Actions sur la sélection' });
    expect(within(bar).getByRole('status')).toHaveTextContent('2 produits sélectionnés');
    await userEvent.click(within(bar).getByRole('button', { name: 'Terminer' }));
    expect(screen.queryByRole('region', { name: 'Actions sur la sélection' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retirer une unité de Lait' })).toBeInTheDocument();
  });

  it('removes the ticked lines as consumed and undoes with the same reason', async () => {
    const { adjust } = renderList(twoLines());
    await select('Lait', 'Eau');
    await userEvent.click(screen.getByRole('button', { name: 'Consommé' }));
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(2));
    expect(adjust).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 10, delta: -3, reason: 'consumed' }),
    );
    expect(adjust).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 20, delta: -2, reason: 'consumed' }),
    );
    const toast = (await screen.findByText('Consommé : 2 produits')).closest(
      '[role="status"]',
    ) as HTMLElement;
    await userEvent.click(within(toast).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(4));
    expect(adjust).toHaveBeenLastCalledWith(
      expect.objectContaining({ delta: 2, reason: 'consumed' }),
    );
  });

  it('removes the ticked lines as wasted', async () => {
    const { adjust } = renderList(twoLines());
    await select('Thé');
    await userEvent.click(screen.getByRole('button', { name: 'Jeté' }));
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 30, delta: -1, reason: 'wasted' }),
      ),
    );
  });

  it('keeps the actions off until something is ticked', async () => {
    renderList(twoLines());
    await userEvent.click(await screen.findByRole('button', { name: 'Sélectionner' }));
    expect(screen.getByRole('button', { name: 'Déplacer vers…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Consommé' })).toBeDisabled();
  });

  it('moves the ticked lines whole to one destination', async () => {
    const move = vi.fn(async () => ({}) as never);
    renderList(twoLines(), { move });
    await select('Lait', 'Eau');
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer vers…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Déplacer 2 produits vers…' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Meuble'), '11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(move).toHaveBeenCalledWith({
      stockItemId: 1,
      toLocationId: 11,
      toShelfId: null,
      quantity: 3,
    });
    expect(move).toHaveBeenCalledWith({
      stockItemId: 2,
      toLocationId: 11,
      toShelfId: null,
      quantity: 2,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says how many were moved when one move fails', async () => {
    const move = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(409, 'Étagère pleine'));
    renderList(twoLines(), { move });
    await select('Lait', 'Eau');
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer vers…' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Meuble'), '11');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Déplacer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('1 sur 2 déplacés');
  });
});

describe('ListView: out-of-stock invitation', () => {
  afterEach(() => outOfStockStore.clear());
  const answer = (productTotal: number, onShoppingList = false) =>
    ({ item: null, movement: {}, productTotal, onShoppingList }) as never;

  it('invites after « − » took the last unit, and drops it on Annuler', async () => {
    const adjust = vi.fn(async () => answer(0));
    renderList([line(1, 'Lait', 1, 3)], { adjust });
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    await waitFor(() => expect(outOfStockStore.get()?.name).toBe('Lait'));
    const toast = (await screen.findByText(/Consommé : 1 × Lait/)).closest('[role="status"]')!;
    await userEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Annuler' }));
    expect(outOfStockStore.get()).toBeNull();
  });

  it('does not invite when the product is already on the list', async () => {
    renderList([line(1, 'Lait', 1, 3)], { adjust: vi.fn(async () => answer(0, true)) });
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer une unité de Lait' }));
    await screen.findByText(/Consommé : 1 × Lait/);
    expect(outOfStockStore.get()).toBeNull();
  });

  it('batch removal: one invitation, for the last product fallen to zero', async () => {
    const adjust = vi.fn(async (input: { productId: number }) =>
      input.productId === 30 ? answer(4) : answer(0),
    );
    renderList([line(1, 'Lait', 2, 3), line(2, 'Eau', 1, 2), line(3, 'Thé', 1, 1)], {
      adjust: adjust as never,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Sélectionner' }));
    for (const name of ['Lait', 'Eau', 'Thé']) {
      await userEvent.click(screen.getByRole('checkbox', { name: `Sélectionner ${name}` }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Consommé' }));
    await waitFor(() => expect(outOfStockStore.get()?.name).toBe('Eau'));
  });
});
