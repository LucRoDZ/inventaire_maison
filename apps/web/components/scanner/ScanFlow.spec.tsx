import type {
  CategoryDto,
  LocationDto,
  ProductDetailDto,
  ProductDto,
  ScanResponse,
} from '@inventaire/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { resolveScan } from '../../lib/scan-flow';
import type { ScanResult, Scanner } from '../../lib/scanner/types';
import * as stockApi from '../../lib/stock-api';
import { ScanFlow, type UnknownContext } from './ScanFlow';

vi.mock('../../lib/stock-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/stock-api')>()),
  adjustStock: vi.fn(async () => ({ item: null, movement: {} })),
  updateProductCategory: vi.fn(async () => ({})),
}));

const locations: LocationDto[] = [
  {
    id: 2,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    productCount: 0,
    sortOrder: 1,
    shelves: [{ id: 21, locationId: 2, name: 'Étagère 2', kind: 'plain', sortOrder: 1 }],
  },
];
const categories: CategoryDto[] = [
  { id: 5, name: 'Épicerie sucrée', icon: 'candy', sortOrder: 1, isFallback: false },
  { id: 9, name: 'Autre', icon: 'package', sortOrder: 2, isFallback: true },
];
const product: ProductDto = {
  id: 7,
  barcode: '3017620422003',
  name: 'Pâte à tartiner Nutella',
  brand: 'Ferrero',
  sizeLabel: '400 g',
  imageUrl: null,
  categoryId: 9,
  categoryGuessed: true,
  defaultLocationId: null,
  source: 'off',
  createdBy: 1,
  createdAt: '2026-06-01T10:00:00.000Z',
};
const known: ProductDetailDto = { ...product, categoryGuessed: false, stock: [] };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  setOnline(true);
  window.localStorage.clear();
  vi.mocked(stockApi.adjustStock).mockClear();
  vi.mocked(stockApi.updateProductCategory).mockClear();
});
afterEach(() => setOnline(true));

function renderFlow(
  response: ScanResponse | Error,
  extra: Partial<React.ComponentProps<typeof ScanFlow>> = {},
) {
  const fetchScan = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  render(
    <ScanFlow
      api={{
        fetchScan,
        fetchLocations: async () => locations,
        fetchCategories: async () => categories,
      }}
      {...extra}
    />,
  );
  return { fetchScan };
}

async function typeCode(code: string) {
  await userEvent.type(screen.getByLabelText('Code-barres'), `${code}{Enter}`);
}

describe('resolveScan', () => {
  it('rejects an invalid code without calling the network', async () => {
    const fetchScan = vi.fn();
    const outcome = await resolveScan('3017620422004', undefined, { online: true, fetchScan });
    expect(outcome).toMatchObject({ kind: 'invalid' });
    expect(fetchScan).not.toHaveBeenCalled();
  });

  it('does not call the network offline', async () => {
    const fetchScan = vi.fn();
    expect(await resolveScan('3017620422003', 'ean_13', { online: false, fetchScan })).toEqual({
      kind: 'offline',
    });
    expect(fetchScan).not.toHaveBeenCalled();
  });

  it('sends the canonical code (UPC-A becomes EAN-13)', async () => {
    const fetchScan = vi.fn(
      async () => ({ status: 'unknown', reason: 'not_found' }) as ScanResponse,
    );
    await resolveScan('036000291452', 'upc_a', { online: true, fetchScan });
    expect(fetchScan).toHaveBeenCalledWith('0036000291452');
  });

  it('maps the three answers and the failures', async () => {
    const run = (r: ScanResponse | Error) =>
      resolveScan('3017620422003', 'ean_13', {
        online: true,
        fetchScan: async () => {
          if (r instanceof Error) throw r;
          return r;
        },
      });
    expect(await run({ status: 'known', product: known })).toMatchObject({
      kind: 'product',
      suggested: false,
    });
    expect(await run({ status: 'suggested', product })).toMatchObject({
      kind: 'product',
      suggested: true,
    });
    expect(
      await run({
        status: 'unknown',
        reason: 'poor_data',
        hints: { brand: 'X', sizeLabel: null, imageUrl: null },
      }),
    ).toEqual({
      kind: 'unknown',
      barcode: '3017620422003',
      reason: 'poor_data',
      hints: { brand: 'X', sizeLabel: null, imageUrl: null },
    });
    expect(await run(new ApiError(0, 'réseau'))).toEqual({ kind: 'offline' });
    expect(await run(new ApiError(500, 'Erreur du serveur'))).toEqual({
      kind: 'error',
      message: 'Erreur du serveur',
    });
  });
});

describe('ScanFlow', () => {
  it('opens the add sheet for a known product, without the proposed category', async () => {
    renderFlow({ status: 'known', product: known });
    await typeCode('3017620422003');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pâte à tartiner Nutella' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Catégorie proposée' })).toBeNull();
  });

  it('opens the add sheet with the proposed category, saved when the product is added', async () => {
    renderFlow({ status: 'suggested', product });
    await typeCode('3017620422003');
    const group = await screen.findByRole('radiogroup', { name: 'Catégorie proposée' });
    expect(within(group).getByRole('radio', { name: /Autre/ })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: /Épicerie sucrée/ }));
    // Picking is local: nothing is saved before the product is added.
    expect(stockApi.updateProductCategory).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Ajouter' }),
    );
    await waitFor(() => expect(stockApi.updateProductCategory).toHaveBeenCalledWith(7, 5));
    await waitFor(() => expect(stockApi.adjustStock).toHaveBeenCalled());
  });

  it('shows the unknown-product slot with the context of the scan', async () => {
    const renderUnknown = vi.fn<(context: UnknownContext) => ReactNode>(() => <p>formulaire</p>);
    renderFlow({ status: 'unknown', reason: 'not_found' }, { renderUnknown });
    await typeCode('3017620422003');
    expect(await screen.findByText('formulaire')).toBeInTheDocument();
    expect(renderUnknown.mock.calls[0]![0]).toMatchObject({
      barcode: '3017620422003',
      reason: 'not_found',
      hints: null,
    });
  });

  it('reports an invalid code and keeps scanning', async () => {
    const { fetchScan } = renderFlow({ status: 'known', product: known });
    await typeCode('3017620422004');
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/);
    expect(fetchScan).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says « Pas de connexion » offline and does not call the API', async () => {
    setOnline(false);
    const { fetchScan } = renderFlow({ status: 'known', product: known });
    await typeCode('3017620422003');
    expect(await screen.findAllByText('Pas de connexion')).not.toHaveLength(0);
    expect(fetchScan).not.toHaveBeenCalled();
  });

  it('shows the server message when the scan fails', async () => {
    renderFlow(new ApiError(500, 'Erreur du serveur'));
    await typeCode('3017620422003');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });

  it('adds, then offers Annuler which sends a correction', async () => {
    renderFlow({ status: 'known', product: known });
    await typeCode('3017620422003');
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ajouter' }),
    );
    const toast = await screen.findByText(/Ajouté : 1 × Pâte à tartiner Nutella, Frigo/);
    expect(toast).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(stockApi.adjustStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ delta: -1, reason: 'correction', productId: 7 }),
      ),
    );
    expect(screen.queryByText(/Ajouté :/)).toBeNull();
  });

  it('ignores a second code while the first one is being resolved', async () => {
    let release: (value: ScanResponse) => void = () => undefined;
    const fetchScan = vi.fn(() => new Promise<ScanResponse>((resolve) => (release = resolve)));
    render(
      <ScanFlow
        api={{
          fetchScan,
          fetchLocations: async () => locations,
          fetchCategories: async () => categories,
        }}
      />,
    );
    await typeCode('3017620422003');
    await typeCode('96385074');
    expect(fetchScan).toHaveBeenCalledTimes(1);
    await act(async () => release({ status: 'known', product: known }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('pauses reading of the camera during the add and resumes after', async () => {
    const getUserMedia = vi.fn(async () => {
      const track = {
        stop: vi.fn(),
        getCapabilities: () => ({}),
        getSettings: () => ({}),
        applyConstraints: vi.fn(),
      };
      return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices: async () => [] },
    });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    let emit: (result: ScanResult) => void = () => undefined;
    const scanner: Scanner = {
      engine: 'zxing',
      start: vi.fn((_video, onResult) => {
        emit = onResult;
      }),
      stop: vi.fn(),
      decodeImage: async () => null,
    };
    renderFlow({ status: 'known', product: known }, { makeScanner: async () => scanner });
    await userEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(1));

    act(() => emit({ code: '3017620422003', format: 'ean_13' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(scanner.stop).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter et scanner le suivant' }));
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(2));
  });

  it('adds a product found by name with the manual reason', async () => {
    const searchProducts = vi.fn(async () => [product]);
    render(
      <ScanFlow
        api={{
          searchProducts,
          fetchLocations: async () => locations,
          fetchCategories: async () => categories,
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter sans code-barres' }));
    await userEvent.type(await screen.findByLabelText('Nom du produit'), 'pate');
    await userEvent.click(await screen.findByRole('button', { name: /Pâte à tartiner Nutella/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Pâte à tartiner Nutella' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(stockApi.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 7, reason: 'manual' }),
      ),
    );
  });
});
