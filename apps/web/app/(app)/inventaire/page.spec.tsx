import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('vue=liste'),
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => '/inventaire',
}));
vi.mock('../../../lib/stock-api', () => ({
  fetchCategories: async () => [],
  fetchStockSummary: async () => ({
    inStock: 24,
    today: 2,
    soon: 5,
    expired: 1,
    expiryAlertDays: 3,
  }),
}));
vi.mock('../../../components/list/ListView', () => ({
  ListView: () => (
    <ul>
      {Array.from({ length: 60 }, (_, i) => (
        <li key={i}>Produit {i}</li>
      ))}
    </ul>
  ),
}));
vi.mock('../../../components/home/HomeView', () => ({ HomeView: () => <p>Meubles</p> }));
vi.mock('../../../components/add/AddFab', () => ({ AddFab: () => null }));
vi.mock('../../../lib/offline', () => ({ PendingSyncBadge: () => null }));
import InventairePage from './page';

describe('Inventaire page', () => {
  it('keeps the counters and the switch out of the scrolling region; only the list scrolls', async () => {
    render(<InventairePage />);
    const zone = await screen.findByRole('region', { name: 'Liste des produits' });
    const counters = screen.getByRole('region', { name: 'Résumé du stock' });
    expect(zone).not.toContainElement(counters);
    expect(zone).not.toContainElement(screen.getByRole('button', { name: 'Liste' }));
    expect(within(zone).getAllByRole('listitem')).toHaveLength(60);
    expect(within(counters).queryAllByRole('listitem')).toHaveLength(0);
  });
});
