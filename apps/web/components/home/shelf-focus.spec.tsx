import type { HomeResponse, HomeTileDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn() };
let params = { lieu: '2', etagere: '21' };
vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => router,
  usePathname: () => '/inventaire/2/etagere/21',
  useSearchParams: () => new URLSearchParams(),
}));
let home: HomeResponse;
let cached: HomeResponse | null = null;
let fetchHome = vi.fn(async () => home);
vi.mock('../../lib/home-api', () => ({
  fetchHome: () => fetchHome(),
  cachedHome: () => cached,
}));
vi.mock('../../lib/stock-api', () => ({
  fetchCategories: async () => [],
  fetchLocations: async () => [],
}));
import { ShelfFocusPage } from './ShelfFocusPage';

const tile = (id: number, name: string, expiry: HomeTileDto['expiry'] = null): HomeTileDto => ({
  stockItemId: id,
  productId: id * 10,
  name,
  brand: null,
  imageUrl: null,
  category: { id: 1, name: 'Boissons', icon: 'milk' },
  quantity: 2,
  expiryDate: null,
  expiry,
});

beforeEach(() => {
  vi.clearAllMocks();
  cached = null;
  fetchHome = vi.fn(async () => home);
  params = { lieu: '2', etagere: '21' };
  home = {
    locations: [
      {
        id: 2,
        name: 'Frigo',
        kind: 'fridge',
        icon: 'refrigerator',
        counts: { products: 3, units: 6, expired: 1, soon: 1 },
        shelves: [
          {
            id: 21,
            name: 'Étagère 1',
            kind: 'plain',
            tiles: [
              tile(1, 'Lait', { status: 'expired' }),
              tile(2, 'Yaourt', { status: 'soon', days: 2 }),
              tile(3, 'Eau'),
            ],
          },
          { id: 22, name: 'Étagère 2', kind: 'plain', tiles: [] },
        ],
        unshelved: [tile(4, 'Beurre')],
      },
    ],
  };
});

describe('ShelfFocusPage', () => {
  it('draws the house the furniture just read at once, before the refresh answers', () => {
    cached = home;
    fetchHome = vi.fn(() => new Promise<HomeResponse>(() => undefined));
    render(<ShelfFocusPage />);
    // Synchronous: no wait for the network.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Frigo · Étagère 1' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lait, quantité 2/ })).toBeInTheDocument();
    expect(fetchHome).toHaveBeenCalled();
  });

  it('shows one h1, the grid with rings and spoken expiry, and a + to the scanner', async () => {
    render(<ShelfFocusPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Frigo · Étagère 1' }),
    ).toBeVisible();
    const zone = screen.getByRole('region', { name: 'Produits : Étagère 1' });
    expect(zone).toHaveClass('overflow-y-auto', 'overscroll-contain');
    expect(within(zone).getAllByRole('button')).toHaveLength(3);
    const lait = within(zone).getByRole('button', { name: 'Lait, quantité 2, périmé' });
    expect(lait.querySelector('[data-expiry]')).toHaveClass('ring-alert');
    const yaourt = within(zone).getByRole('button', {
      name: 'Yaourt, quantité 2, périme dans 2 jours',
    });
    expect(yaourt.querySelector('[data-expiry]')).toHaveClass('ring-expiry-soon-ring');
    expect(within(zone).getByRole('button', { name: 'Eau, quantité 2' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ajouter un produit sur Étagère 1' })).toHaveAttribute(
      'href',
      '/scanner?lieu=2&etagere=21',
    );
  });

  it('opens the product sheet from a tile', async () => {
    render(<ShelfFocusPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Eau, quantité 2/ }));
    expect(await screen.findByText('Voir la fiche produit')).toBeInTheDocument();
  });

  it('shows « Vide » and an Ajouter button for an empty shelf', async () => {
    params = { lieu: '2', etagere: '22' };
    render(<ShelfFocusPage />);
    expect(await screen.findByText('Vide')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ajouter' })).toHaveAttribute(
      'href',
      '/scanner?lieu=2&etagere=22',
    );
    expect(screen.queryByRole('link', { name: /^Ajouter un produit/ })).toBeNull();
  });

  it('serves the tray under non-range', async () => {
    params = { lieu: '2', etagere: 'non-range' };
    render(<ShelfFocusPage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Frigo · Non rangé' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Beurre, quantité 2' })).toBeVisible();
  });

  it('says « Étagère introuvable » for an unknown shelf or furniture', async () => {
    params = { lieu: '2', etagere: '999' };
    const { unmount } = render(<ShelfFocusPage />);
    expect(await screen.findByText('Étagère introuvable')).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'Retour au meuble' })[1]!);
    expect(router.replace).toHaveBeenCalledWith('/inventaire/2');
    unmount();
    params = { lieu: '77', etagere: '21' };
    render(<ShelfFocusPage />);
    expect(await screen.findByText('Étagère introuvable')).toBeVisible();
  });

  it('goes back to the furniture with the arrow', async () => {
    render(<ShelfFocusPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retour au meuble' }));
    expect(router.replace).toHaveBeenCalledWith('/inventaire/2');
  });
});
