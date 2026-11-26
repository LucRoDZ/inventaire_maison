import type { RecentProductDto } from '@inventaire/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddFab } from './AddFab';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const queueOp = vi.fn(async () => ({}));
const syncNow = vi.fn(async () => undefined);
vi.mock('../../lib/offline/runtime', () => ({
  queueOp: (op: unknown) => (queueOp as (o: unknown) => Promise<unknown>)(op),
  syncNow: () => syncNow(),
}));

const fetchRecentProducts = vi.fn<() => Promise<RecentProductDto[]>>();
vi.mock('../../lib/shopping-api', () => ({ fetchRecentProducts: () => fetchRecentProducts() }));
vi.mock('../../lib/stock-api', () => ({
  fetchLocations: async () => [],
  fetchCategories: async () => [],
}));

const recent = (count: number): RecentProductDto[] =>
  Array.from({ length: count }, (_, i) => ({
    productId: i + 1,
    name: `Produit ${i + 1}`,
    imageUrl: null,
    count: 1,
  }));

const openMenu = async () => {
  const user = userEvent.setup();
  render(<AddFab />);
  const fab = screen.getByRole('button', { name: 'Ajouter un produit' });
  await user.click(fab);
  return { user, fab, dialog: screen.getByRole('dialog', { name: 'Ajouter' }) };
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchRecentProducts.mockResolvedValue(recent(2));
});

describe('add menu', () => {
  it('exposes the button as the opener of a dialog', () => {
    render(<AddFab />);
    expect(screen.getByRole('button', { name: 'Ajouter un produit' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('closes with Escape and gives the focus back to the button', async () => {
    const { user, fab } = await openMenu();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab).toHaveFocus();
  });

  it('closes with a tap on the background', async () => {
    const { user, fab, dialog } = await openMenu();
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab).toHaveFocus();
  });

  it('keeps the focus inside the sheet while tabbing', async () => {
    const { user, dialog } = await openMenu();
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('scans through the scanner route', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Scanner/ }));
    expect(push).toHaveBeenCalledWith('/scanner');
  });

  it('adds one unit again, then cancels it', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter à nouveau/ }));
    await user.click(await screen.findByRole('button', { name: 'Produit 2' }));
    expect(queueOp).toHaveBeenCalledWith({ kind: 'add', productId: 2, quantity: 1 });
    expect(syncNow).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Produit 2 : +1');

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(queueOp).toHaveBeenLastCalledWith({
        kind: 'remove',
        productId: 2,
        quantity: 1,
        reason: 'consumed',
      }),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows six products, then all with « Voir plus »', async () => {
    fetchRecentProducts.mockResolvedValue(recent(9));
    const { user, dialog } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter à nouveau/ }));
    await screen.findByRole('button', { name: 'Produit 1' });
    expect(within(dialog).getAllByRole('button', { name: /^Produit \d/ })).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Voir plus' }));
    expect(within(dialog).getAllByRole('button', { name: /^Produit \d/ })).toHaveLength(9);
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('says so when nothing was consumed lately', async () => {
    fetchRecentProducts.mockResolvedValue([]);
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter à nouveau/ }));
    expect(
      await screen.findByText('Aucun produit consommé ces 30 derniers jours'),
    ).toBeInTheDocument();
  });

  it('lists only what the household endpoint returns', async () => {
    fetchRecentProducts.mockResolvedValue([
      { productId: 9, name: 'Lait du foyer', imageUrl: null, count: 3 },
    ]);
    const { user, dialog } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter à nouveau/ }));
    await screen.findByRole('button', { name: 'Lait du foyer' });
    expect(fetchRecentProducts).toHaveBeenCalledTimes(1);
    expect(within(dialog).getAllByRole('button', { name: /^(?!Ajouter|Scanner)/ })).toHaveLength(1);
  });

  it('opens the catalogue search for a manual add', async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: /^Ajouter manuellement/ }));
    expect(screen.getByLabelText('Nom du produit')).toBeInTheDocument();
    await act(async () => undefined);
  });
});
