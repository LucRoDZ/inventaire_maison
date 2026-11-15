import type { CategoryDto, ProductDto } from '@inventaire/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AClasserPage from '../../app/(app)/a-classer/page';
import { ApiError } from '../../lib/api';
import { setReviewCount } from '../../lib/review-count';
import { BottomNav } from '../nav/BottomNav';
import { ReviewCard } from './ReviewCard';

const categories: CategoryDto[] = [
  { id: 1, name: 'Laitier', icon: 'milk', sortOrder: 1, isFallback: false },
  { id: 2, name: 'Boissons', icon: 'cup-soda', sortOrder: 2, isFallback: false },
  { id: 3, name: 'Autre', icon: 'package', sortOrder: 3, isFallback: true },
];
const product: ProductDto = {
  id: 7,
  barcode: '3017620422003',
  name: 'Lait',
  brand: 'Lactel',
  sizeLabel: null,
  imageUrl: null,
  categoryId: 1,
  categoryGuessed: true,
  defaultLocationId: null,
  source: 'off',
  createdBy: 1,
  createdAt: '2026-06-01T10:00:00.000Z',
};

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const stock = vi.hoisted(() => ({ fetchCategories: vi.fn(), updateProductCategory: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  apiFetch: api.apiFetch,
}));
vi.mock('../../lib/stock-api', () => stock);
vi.mock('next/navigation', () => ({ usePathname: () => '/a-classer' }));

beforeEach(() => {
  vi.clearAllMocks();
  setReviewCount(0);
  stock.fetchCategories.mockResolvedValue(categories);
  stock.updateProductCategory.mockResolvedValue(product);
});

describe('ReviewCard', () => {
  it('confirms the proposed category in one tap', async () => {
    const onClassify = vi.fn(async () => undefined);
    render(<ReviewCard product={product} categories={categories} onClassify={onClassify} />);
    expect(screen.getByText(/Catégorie proposée/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Confirmer Laitier/ }));
    expect(onClassify).toHaveBeenCalledWith(product, 1);
  });

  it('classes the product in another category in one tap', async () => {
    const onClassify = vi.fn(async () => undefined);
    render(<ReviewCard product={product} categories={categories} onClassify={onClassify} />);
    await userEvent.click(screen.getByRole('button', { name: 'Boissons' }));
    expect(onClassify).toHaveBeenCalledWith(product, 2);
  });

  it('shows the error and stays usable when saving fails', async () => {
    const onClassify = vi.fn().mockRejectedValue(new ApiError(0, 'réseau'));
    render(<ReviewCard product={product} categories={categories} onClassify={onClassify} />);
    await userEvent.click(screen.getByRole('button', { name: 'Boissons' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vérifiez la connexion');
    expect(screen.getByRole('button', { name: 'Boissons' })).toBeEnabled();
  });
});

describe('À classer page', () => {
  it('removes a product once classified, then shows the empty state', async () => {
    api.apiFetch.mockResolvedValue([product]);
    render(<AClasserPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Confirmer Laitier/ }));
    expect(stock.updateProductCategory).toHaveBeenCalledWith(7, 1);
    expect(await screen.findByText('Tout est classé')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing waits', async () => {
    api.apiFetch.mockResolvedValue([]);
    render(<AClasserPage />);
    expect(await screen.findByText('Tout est classé')).toBeInTheDocument();
  });

  it('keeps the card when saving fails', async () => {
    api.apiFetch.mockResolvedValue([product]);
    stock.updateProductCategory.mockRejectedValue(new ApiError(0, 'réseau'));
    render(<AClasserPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Boissons' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Lait' })).toBeInTheDocument();
  });
});

describe('badge of the À classer tab', () => {
  it('shows the count and hides at zero', async () => {
    api.apiFetch.mockResolvedValue([product, { ...product, id: 8 }]);
    render(<BottomNav />);
    expect(await screen.findByLabelText('2 à classer')).toBeInTheDocument();
    act(() => setReviewCount(0));
    await waitFor(() => expect(screen.queryByLabelText(/à classer$/)).not.toBeInTheDocument());
  });
});
