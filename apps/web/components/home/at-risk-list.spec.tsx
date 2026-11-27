import type { StockListItemDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NO_FILTER, type HomeFilters } from '../../lib/home-filters';
import { AtRiskList } from './AtRiskList';

const line = (
  id: number,
  name: string,
  expiryDate: string,
  expiry: StockListItemDto['expiry'],
  over: Partial<StockListItemDto> = {},
): StockListItemDto => ({
  id,
  quantity: 2,
  expiryDate,
  expiry,
  createdAt: '2026-06-01T10:00:00.000Z',
  product: {
    id: id * 10,
    name,
    brand: null,
    sizeLabel: null,
    imageUrl: null,
    categoryGuessed: false,
  },
  category: { id: 1, name: 'Laitiers', icon: 'milk' },
  location: { id: 2, name: 'Garde-manger' },
  shelf: { id: 21, name: 'Étagère 3' },
  ...over,
});

const filters = (expiry: HomeFilters['expiry'], q = ''): HomeFilters => ({
  ...NO_FILTER,
  expiry,
  q,
});

// Deliberately out of order: the list sorts by date.
const stock = [
  line(1, 'Yaourt', '2026-06-10', { status: 'soon', days: 2 }),
  line(2, 'Lait', '2026-06-01', { status: 'expired' }),
  line(3, 'Beurre', '2026-06-05', { status: 'expired' }, { shelf: null }),
];

const api = (items = stock) => ({
  fetchStock: vi.fn(async () => ({ items }) as never),
  fetchLocations: async () => [],
  adjust: vi.fn(async () => ({}) as never),
});

describe('AtRiskList', () => {
  it('lists the lines most urgent first, with rings and where they are', async () => {
    const seams = api();
    render(<AtRiskList filters={filters('expired')} onClear={vi.fn()} api={seams} />);
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Lait',
      'Beurre',
      'Yaourt',
    ]);
    expect(seams.fetchStock).toHaveBeenCalledWith(
      expect.objectContaining({ expiry: 'expired', sort: 'expiry' }),
    );
    expect(within(rows[0]!).getByText('Garde-manger · Étagère 3')).toBeVisible();
    expect(within(rows[1]!).getByText('Garde-manger · Non rangé')).toBeVisible();
    expect(rows[0]!.querySelector('[data-expiry="expired"]')).toHaveClass('ring-alert');
    expect(rows[2]!.querySelector('[data-expiry="soon"]')).toHaveClass('ring-expiry-soon-ring');
  });

  it('sends the search with the filter', async () => {
    const seams = api();
    render(<AtRiskList filters={filters('soon', 'lait')} onClear={vi.fn()} api={seams} />);
    await screen.findAllByRole('listitem');
    await waitFor(() =>
      expect(seams.fetchStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'lait', expiry: 'soon' }),
      ),
    );
  });

  it.each([
    ['today', 'Rien à consommer aujourd’hui'],
    ['soon', 'Rien ne périme bientôt'],
    ['expired', 'Rien de périmé'],
  ] as const)('says « %s » is empty and brings the cards back', async (expiry, text) => {
    const onClear = vi.fn();
    render(<AtRiskList filters={filters(expiry)} onClear={onClear} api={api([])} />);
    expect(await screen.findByText(text)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Voir tous les meubles' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows a retry on error', async () => {
    const seams = api();
    seams.fetchStock.mockRejectedValueOnce(new Error('x'));
    render(<AtRiskList filters={filters('expired')} onClear={vi.fn()} api={seams} />);
    await userEvent.click(await screen.findByRole('button', { name: /Réessayer/ }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  });

  it('opens the sheet with « Voir dans le meuble » to the shelf focus page or the furniture', async () => {
    render(<AtRiskList filters={filters('expired')} onClear={vi.fn()} api={api()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir Lait' }));
    expect(await screen.findByRole('link', { name: 'Voir dans le meuble' })).toHaveAttribute(
      'href',
      '/inventaire/2/etagere/21',
    );
  });

  it('links an unshelved line to the furniture', async () => {
    render(<AtRiskList filters={filters('expired')} onClear={vi.fn()} api={api()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir Beurre' }));
    expect(await screen.findByRole('link', { name: 'Voir dans le meuble' })).toHaveAttribute(
      'href',
      '/inventaire/2',
    );
  });

  it('drops a line from the list once it is thrown away and tells the counters', async () => {
    const seams = api();
    const onStockChanged = vi.fn();
    seams.fetchStock
      .mockResolvedValueOnce({ items: stock } as never)
      .mockResolvedValue({ items: stock.filter((l) => l.id !== 2) } as never);
    render(
      <AtRiskList
        filters={filters('expired')}
        onClear={vi.fn()}
        onStockChanged={onStockChanged}
        api={seams}
      />,
    );
    await screen.findAllByRole('listitem');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer une unité de Lait' }));
    await waitFor(() => expect(onStockChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Lait' })).toBeNull());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(seams.adjust).toHaveBeenCalledWith(expect.objectContaining({ reason: 'consumed' }));
  });
});
