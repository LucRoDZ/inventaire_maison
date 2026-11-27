import type {
  CategoryDto,
  LocationDto,
  ProductDetailDto,
  ProductDto,
  ScanResponse,
} from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as stockApi from '../../lib/stock-api';
import { installFakeCamera } from './fake-camera';
import { ScanFlow } from './ScanFlow';

vi.mock('../../lib/scanner/create-scanner', () => ({
  createScanner: async () => (await import('./fake-camera')).idleScanner(),
}));

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
    shelves: [],
  },
];
const categories: CategoryDto[] = [
  { id: 9, name: 'Autre', icon: 'package', sortOrder: 2, isFallback: true, shelfLifeDays: null },
];
const product = {
  id: 7,
  barcode: '3017620422003',
  name: 'Yaourt nature',
  brand: null,
  categoryId: 9,
  categoryGuessed: false,
  defaultLocationId: 2,
  amount: null,
  unit: null,
} as unknown as ProductDto;
const known: ProductDetailDto = { ...product, stock: [] };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}
beforeEach(() => {
  installFakeCamera();
  setOnline(true);
  window.localStorage.clear();
  vi.mocked(stockApi.adjustStock).mockClear();
});
afterEach(() => setOnline(true));

function renderFlow(response: ScanResponse, extra: Record<string, unknown> = {}) {
  render(
    <ScanFlow
      api={{
        fetchScan: async () => response,
        fetchLocations: async () => locations,
        fetchCategories: async () => categories,
        ...extra,
      }}
    />,
  );
}

const typeCode = async (code: string) => {
  if (!screen.queryByLabelText('Code-barres')) {
    await userEvent.click(screen.getByRole('button', { name: 'Saisir un code' }));
  }
  await userEvent.type(screen.getByLabelText('Code-barres'), `${code}{Enter}`);
};

describe('burst scan', () => {
  it('is off by default: a known product opens the form', async () => {
    renderFlow({ status: 'known', product: known });
    await typeCode('3017620422003');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(stockApi.adjustStock).not.toHaveBeenCalled();
  });

  it('adds +1 at the usual place without a form, with an Annuler toast', async () => {
    renderFlow({ status: 'known', product: known });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Scan en rafale' }));
    await typeCode('3017620422003');
    const toast = (await screen.findByText(/Ajouté : 1 × Yaourt nature, Frigo/)).closest(
      '[role="status"]',
    ) as HTMLElement;
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stockApi.adjustStock).toHaveBeenCalledWith({
      productId: 7,
      locationId: 2,
      shelfId: null,
      expiryDate: null,
      delta: 1,
      reason: 'scan_add',
    });
    await userEvent.click(within(toast).getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(stockApi.adjustStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ delta: -1, reason: 'correction' }),
      ),
    );
  });

  it('opens the form for a known product without a usual place', async () => {
    renderFlow({ status: 'known', product: { ...known, defaultLocationId: null } });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Scan en rafale' }));
    await typeCode('3017620422003');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(stockApi.adjustStock).not.toHaveBeenCalled();
  });

  it('opens the creation form for an unknown code', async () => {
    renderFlow({ status: 'unknown', reason: 'not_found' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Scan en rafale' }));
    await typeCode('3017620422003');
    expect(await screen.findByRole('heading', { name: 'Nouveau produit' })).toBeInTheDocument();
  });
});

describe('unknown code: existing product', () => {
  it('attaches the code to the product picked, then opens the add sheet', async () => {
    const attachBarcode = vi.fn(async () => ({ ...product, barcode: '3017620422003' }));
    renderFlow(
      { status: 'unknown', reason: 'not_found' },
      { attachBarcode, searchProducts: async () => [product] },
    );
    await typeCode('3017620422003');
    await userEvent.click(await screen.findByRole('button', { name: 'C’est un produit existant' }));
    await userEvent.type(await screen.findByLabelText('Nom du produit'), 'yaourt');
    await userEvent.click(await screen.findByRole('button', { name: /Yaourt nature/ }));
    await waitFor(() => expect(attachBarcode).toHaveBeenCalledWith(7, '3017620422003'));
    expect(await screen.findByRole('heading', { name: 'Yaourt nature' })).toBeInTheDocument();
  });

  it('says so when the code cannot be attached', async () => {
    const attachBarcode = vi.fn(async () => {
      throw new Error('boom');
    });
    renderFlow(
      { status: 'unknown', reason: 'not_found' },
      { attachBarcode, searchProducts: async () => [product] },
    );
    await typeCode('3017620422003');
    await userEvent.click(await screen.findByRole('button', { name: 'C’est un produit existant' }));
    await userEvent.type(await screen.findByLabelText('Nom du produit'), 'yaourt');
    await userEvent.click(await screen.findByRole('button', { name: /Yaourt nature/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rattachement impossible');
  });
});
