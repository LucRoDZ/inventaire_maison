import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { outOfStockStore } from '../../lib/zero-stock';
import { RemovalToast } from '../add/RemovalToast';
import { OutOfStockPrompt } from './OutOfStockPrompt';

const invite = { productId: 7, name: 'Lait', quantity: 2 };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

function setup(api: Parameters<typeof OutOfStockPrompt>[0]['api'] = {}) {
  const add = vi.fn(async () => ({}) as never);
  const queue = vi.fn(async () => ({}));
  render(<OutOfStockPrompt api={{ add, queue, ...api }} />);
  return { add, queue };
}
const show = () => act(() => outOfStockStore.show(invite));

beforeEach(() => setOnline(true));
afterEach(() => {
  outOfStockStore.clear();
  vi.useRealTimers();
});

describe('OutOfStockPrompt', () => {
  it('shows nothing without an invitation from a server answer', () => {
    setup();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('adds to the list with ifAbsent', async () => {
    const { add } = setup();
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Plus de Lait, l’ajouter aux courses ?');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(add).toHaveBeenCalledWith({ productId: 7, quantity: 2, ifAbsent: true });
    expect(await screen.findByText('Ajouté aux courses')).toBeInTheDocument();
  });

  it('says so on a 409', async () => {
    setup({ add: vi.fn(async () => Promise.reject(new ApiError(409, 'Déjà dans vos courses'))) });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Déjà dans vos courses')).toBeInTheDocument();
  });

  it('goes through the offline queue when offline', async () => {
    setOnline(false);
    const { add, queue } = setup();
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(add).not.toHaveBeenCalled();
    expect(queue).toHaveBeenCalledWith({ kind: 'shop', productId: 7, quantity: 2 });
    expect(await screen.findByText('Ajouté aux courses à la reconnexion')).toBeInTheDocument();
  });

  it('queues on a network error', async () => {
    const { queue } = setup({
      add: vi.fn(async () => Promise.reject(new ApiError(0, 'réseau'))),
    });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(queue).toHaveBeenCalled();
  });

  it('closes on « Non merci »', async () => {
    const { add } = setup();
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(add).not.toHaveBeenCalled();
  });

  it('disappears after 8 s', () => {
    vi.useFakeTimers();
    setup();
    show();
    act(() => vi.advanceTimersByTime(7900));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('waits while a mouse hovers it, not after a touch', () => {
    vi.useFakeTimers();
    setup();
    show();
    const toast = screen.getByRole('status');
    act(() => {
      fireEvent.pointerOver(toast, { pointerType: 'mouse' });
    });
    act(() => vi.advanceTimersByTime(20000));
    expect(screen.queryByRole('status')).toBeInTheDocument();
  });

  it('a touch on the text does not stop the 8 s timer', () => {
    vi.useFakeTimers();
    setup();
    show();
    act(() => {
      fireEvent.pointerOver(screen.getByRole('status'), { pointerType: 'touch' });
    });
    act(() => vi.advanceTimersByTime(8100));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disappears when the removal is undone from its toast', async () => {
    const adjust = vi.fn(async () => ({}) as never);
    setup();
    render(
      <RemovalToast
        plan={{
          productId: 7,
          locationId: 1,
          shelfId: null,
          expiryDate: null,
          name: 'Lait',
          units: 1,
        }}
        onClose={() => undefined}
        adjust={adjust}
      />,
    );
    show();
    expect(screen.getAllByRole('status')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(outOfStockStore.get()).toBeNull();
    expect(screen.queryByText(/Plus de Lait/)).toBeNull();
  });

  it('wires « Jeté » of the removal toast to the invitation', async () => {
    const adjust = vi.fn(
      async () => ({ productTotal: 0, onShoppingList: false, item: null }) as never,
    );
    render(
      <RemovalToast
        plan={{
          productId: 7,
          locationId: 1,
          shelfId: null,
          expiryDate: null,
          name: 'Lait',
          units: 1,
        }}
        onClose={() => undefined}
        adjust={adjust}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Jeté' }));
    expect(outOfStockStore.get()?.productId).toBe(7);
  });
});
