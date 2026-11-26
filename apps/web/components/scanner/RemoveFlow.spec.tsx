import type { ProductDetailDto, ScanResponse, StockRemoveResponse } from '@inventaire/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { ScanResult } from '../../lib/scanner/types';
import { RemoveFlow, type RemoveRequest } from './RemoveFlow';

const result: ScanResult = { code: '3017620422003', format: 'ean_13' };
const request = (id = 1): RemoveRequest => ({ id, result });
const milk = {
  id: 7,
  name: 'Lait',
  barcode: result.code,
  stock: [],
} as unknown as ProductDetailDto;
const removed = {
  item: null,
  movement: {
    productId: 7,
    locationId: 2,
    shelfId: 21,
    expiryDate: '2026-12-01',
    delta: -1,
    reason: 'scan_remove',
  },
  product: { id: 7, name: 'Lait' },
  location: { id: 2, name: 'Frigo' },
  shelf: { id: 21, name: 'Étagère 2' },
} as unknown as StockRemoveResponse;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}
beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

function setup(options: {
  scan?: ScanResponse | Error;
  remove?: StockRemoveResponse | Error;
  req?: RemoveRequest | null;
}) {
  const fetchScan = vi.fn(async () => {
    const answer = options.scan ?? { status: 'known', product: milk };
    if (answer instanceof Error) throw answer;
    return answer as ScanResponse;
  });
  const removeOne = vi.fn(async () => {
    const answer = options.remove ?? removed;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const adjust = vi.fn(async () => ({ item: null, movement: {} }) as never);
  const onSwitchToAdd = vi.fn();
  const utils = render(
    <RemoveFlow
      request={options.req === undefined ? request() : options.req}
      onSwitchToAdd={onSwitchToAdd}
      api={{ fetchScan, removeOne, adjust }}
    />,
  );
  return { fetchScan, removeOne, adjust, onSwitchToAdd, ...utils };
}

describe('RemoveFlow', () => {
  it('removes one unit of a known product and says where from', async () => {
    const { fetchScan, removeOne } = setup({});
    expect(await screen.findByRole('status')).toHaveTextContent('Consommé : 1 × Lait, Frigo');
    expect(fetchScan).toHaveBeenCalledWith(result.code, { catalogOnly: true });
    expect(removeOne).toHaveBeenCalledWith(7);
  });

  it('undoes with a +1 correction on the very line that was touched', async () => {
    const { adjust } = setup({});
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(adjust).toHaveBeenCalledWith({
      productId: 7,
      locationId: 2,
      shelfId: 21,
      expiryDate: '2026-12-01',
      delta: 1,
      reason: 'correction',
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('offers « Jeté » as a visible second choice: put back, then removed as wasted', async () => {
    const { adjust } = setup({});
    await userEvent.click(await screen.findByRole('button', { name: 'Jeté' }));
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(2));
    expect(adjust).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ delta: 1, reason: 'correction' }),
    );
    expect(adjust).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ productId: 7, delta: -1, reason: 'wasted' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Jeté : 1 × Lait');
    expect(screen.queryByRole('button', { name: 'Jeté' })).toBeNull();
  });

  it('says « Pas en stock » when the product is known but empty', async () => {
    setup({ remove: new ApiError(404, 'Pas en stock') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas en stock');
    expect(screen.getByRole('alert')).toHaveTextContent('Lait n’est pas en stock');
  });

  it('says « Produit inconnu », creates nothing and proposes the add mode', async () => {
    const { removeOne, onSwitchToAdd } = setup({
      scan: { status: 'unknown', reason: 'not_found' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Produit inconnu');
    expect(removeOne).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Passer en mode Ajouter' }));
    expect(onSwitchToAdd).toHaveBeenCalledWith(result);
  });

  it('reports an invalid code and an offline device without any call', async () => {
    const invalid = setup({ req: { id: 1, result: { code: '3017620422004', format: 'ean_13' } } });
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');
    expect(invalid.fetchScan).not.toHaveBeenCalled();
    invalid.unmount();

    setOnline(false);
    const offline = setup({});
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(offline.fetchScan).not.toHaveBeenCalled();
  });

  it('shows the server message when the removal fails', async () => {
    setup({ remove: new ApiError(500, 'Erreur du serveur') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });

  it('handles each read once, and a new read of the same code again', async () => {
    const { removeOne, rerender, onSwitchToAdd, fetchScan } = setup({});
    await screen.findByRole('status');
    rerender(
      <RemoveFlow
        request={request(1)}
        onSwitchToAdd={onSwitchToAdd}
        api={{ fetchScan, removeOne }}
      />,
    );
    expect(removeOne).toHaveBeenCalledTimes(1);
    rerender(
      <RemoveFlow
        request={request(2)}
        onSwitchToAdd={onSwitchToAdd}
        api={{ fetchScan, removeOne }}
      />,
    );
    await waitFor(() => expect(removeOne).toHaveBeenCalledTimes(2));
  });

  it('renders nothing without a read', () => {
    const { container } = setup({ req: null });
    expect(container).toBeEmptyDOMElement();
  });
});
