import type { RecentProductDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNotice } from '../../lib/add-notice';
import { AddAgainPage } from './AddAgainPage';

const back = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, replace }) }));

let seq = 10;
const queueOp = vi.fn<(op: unknown) => Promise<{ seq: number }>>(async () => ({ seq: seq++ }));
const abandonOp = vi.fn<(n: number) => Promise<void>>(async () => undefined);
const syncNow = vi.fn(async () => undefined);
vi.mock('../../lib/offline/runtime', () => ({
  queueOp: (op: unknown) => queueOp(op),
  abandonOp: (n: number) => abandonOp(n),
  syncNow: () => syncNow(),
}));

const fetchRecentProducts =
  vi.fn<(p: { limit?: number; days?: number }) => Promise<RecentProductDto[]>>();
vi.mock('../../lib/shopping-api', () => ({
  fetchRecentProducts: (params: { limit?: number; days?: number }) => fetchRecentProducts(params),
}));

const product = (id: number, over: Partial<RecentProductDto> = {}): RecentProductDto => ({
  productId: id,
  name: `Produit ${id}`,
  imageUrl: null,
  count: 1,
  lastConsumedAt: `2026-11-${String(10 + id).padStart(2, '0')}T10:00:00.000Z`,
  locationName: null,
  sizeLabel: null,
  inStock: 0,
  ...over,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => product(i + 1));

const names = () =>
  screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label') as string);

beforeEach(() => {
  vi.clearAllMocks();
  seq = 10;
  addNotice.clear();
  fetchRecentProducts.mockResolvedValue(many(3));
});

describe('AddAgainPage', () => {
  it('goes back with the arrow', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(back).toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ajouter à nouveau');
  });

  it('falls back to the inventory when there is no history', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(replace).toHaveBeenCalledWith('/inventaire');
  });

  it('loads a year of products and shows location, size and stock', async () => {
    fetchRecentProducts.mockResolvedValue([
      product(1, { locationName: 'Frigo', sizeLabel: '1 L', inStock: 2 }),
      product(2, { locationName: 'Placard' }),
    ]);
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    expect(fetchRecentProducts).toHaveBeenCalledWith({ limit: 50, days: 365 });
    expect(screen.getByText('Frigo · 1 L')).toBeInTheDocument();
    expect(screen.getByText('Placard')).toBeInTheDocument();
    expect(screen.getByText('2 en stock')).toBeInTheDocument();
  });

  it('searches and sorts', async () => {
    const user = userEvent.setup();
    fetchRecentProducts.mockResolvedValue([
      product(1, { name: 'Pâtes', count: 1, lastConsumedAt: '2026-11-01T10:00:00.000Z' }),
      product(2, { name: 'Beurre', count: 5, lastConsumedAt: '2026-11-02T10:00:00.000Z' }),
      product(3, { name: 'Lait', count: 3, lastConsumedAt: '2026-11-03T10:00:00.000Z' }),
    ]);
    render(<AddAgainPage />);
    await screen.findByText('Pâtes');
    expect(names()).toEqual(['Lait', 'Beurre', 'Pâtes']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trier' }), 'Alphabétique');
    expect(names()).toEqual(['Beurre', 'Lait', 'Pâtes']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trier' }), 'Plus consommés');
    expect(names()).toEqual(['Beurre', 'Lait', 'Pâtes']);
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher des produits précédents' }),
      'la',
    );
    expect(names()).toEqual(['Lait']);
  });

  it('counts the selection in the button, with singular and plural', async () => {
    const user = userEvent.setup();
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    const add = screen.getByRole('button', { name: 'Ajouter 0 produit' });
    expect(add).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Produit 1' }));
    expect(screen.getByRole('button', { name: 'Ajouter 1 produit' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Produit 2' }));
    expect(screen.getByRole('button', { name: 'Ajouter 2 produits' })).toBeEnabled();
  });

  it('bounds the purchase date to the last 30 days', async () => {
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    const input = screen.getByLabelText('Acheté le') as HTMLInputElement;
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const past = new Date(today);
    past.setDate(past.getDate() - 30);
    expect(input.value).toBe(iso(today));
    expect(input.max).toBe(iso(today));
    expect(input.min).toBe(iso(past));
  });

  it('queues one dated add per product, announces, then goes to the inventory', async () => {
    const user = userEvent.setup();
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    const date = screen.getByLabelText('Acheté le') as HTMLInputElement;
    const input = date.min;
    await user.click(screen.getByRole('checkbox', { name: 'Produit 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Produit 3' }));
    await user.clear(date);
    await user.type(date, input);
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 produits' }));
    await waitFor(() => expect(queueOp).toHaveBeenCalledTimes(2));
    const [y, m, d] = input.split('-').map(Number);
    const createdAt = new Date(y!, m! - 1, d!, 12, 0, 0).toISOString();
    expect(queueOp).toHaveBeenCalledWith({ kind: 'add', productId: 1, quantity: 1, createdAt });
    expect(queueOp).toHaveBeenCalledWith({ kind: 'add', productId: 3, quantity: 1, createdAt });
    expect(syncNow).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/inventaire');
    expect(addNotice.get()?.message).toBe('2 produits ajoutés');
  });

  it('abandons every queued op on undo, without any sync', async () => {
    const user = userEvent.setup();
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    await user.click(screen.getByRole('checkbox', { name: 'Produit 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Produit 2' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter 2 produits' }));
    await waitFor(() => expect(addNotice.get()).not.toBeNull());
    await addNotice.get()!.undo();
    expect(abandonOp).toHaveBeenCalledTimes(2);
    expect(abandonOp).toHaveBeenCalledWith(10);
    expect(abandonOp).toHaveBeenCalledWith(11);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('syncs when the announcement is committed', async () => {
    const user = userEvent.setup();
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    await user.click(screen.getByRole('checkbox', { name: 'Produit 1' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 produit' }));
    await waitFor(() => expect(addNotice.get()).not.toBeNull());
    addNotice.get()!.commit();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('asks for 50 more with « Voir plus », hidden when the answer is short', async () => {
    const user = userEvent.setup();
    fetchRecentProducts.mockResolvedValueOnce(many(50)).mockResolvedValueOnce(many(70));
    render(<AddAgainPage />);
    await screen.findByText('Produit 1');
    await user.click(screen.getByRole('button', { name: 'Voir plus' }));
    await waitFor(() =>
      expect(fetchRecentProducts).toHaveBeenLastCalledWith({ limit: 100, days: 365 }),
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(70));
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('says so when empty and retries after an error', async () => {
    const user = userEvent.setup();
    fetchRecentProducts.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    render(<AddAgainPage />);
    await user.click(await screen.findByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Aucun produit consommé pour le moment')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByRole('button')).toBeDisabled();
  });
});
