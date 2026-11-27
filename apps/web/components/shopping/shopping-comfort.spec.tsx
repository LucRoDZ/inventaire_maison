import type { ShoppingItemDto } from '@inventaire/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { ShoppingList, type ShoppingApi } from './ShoppingList';

afterEach(() => vi.unstubAllGlobals());

const line = (id: number, over: Partial<ShoppingItemDto> = {}): ShoppingItemDto => ({
  id,
  product: null,
  label: `Ligne ${id}`,
  quantity: 1,
  amount: null,
  unit: null,
  checked: false,
  origin: 'manual',
  createdAt: '2026-06-01T10:00:00.000Z',
  ...over,
});

function setup(initial: ShoppingItemDto[], over: Partial<ShoppingApi> = {}) {
  let current = initial;
  const api = {
    fetchShopping: vi.fn(async () => ({ items: current })),
    add: vi.fn(async () => undefined),
    patch: vi.fn(async (id: number, patch: { checked?: boolean; quantity?: number }) => {
      current = current.map((l) => (l.id === id ? { ...l, ...patch } : l));
    }),
    remove: vi.fn(async (id: number) => {
      current = current.filter((l) => l.id !== id);
    }),
    clearChecked: vi.fn(),
    storeChecked: vi.fn(),
    fetchRecent: vi.fn(async () => []),
    adjust: vi.fn(),
    ...over,
  } as unknown as ShoppingApi;
  render(<ShoppingList api={api} />);
  return api;
}

const swipe = (target: HTMLElement, dx: number) => {
  const at = (x: number) => ({ pointerId: 1, isPrimary: true, clientX: x, clientY: 50 });
  fireEvent.pointerDown(target, at(200));
  fireEvent.pointerMove(target, at(200 + dx));
  fireEvent.pointerUp(target, at(200 + dx));
};

const rowOf = async (name: string) => {
  const item = (await screen.findByText(name)).closest('li')!;
  return item.querySelector<HTMLElement>('[data-swipe-layer]')!.nextElementSibling as HTMLElement;
};

describe('Courses: swipe', () => {
  it('checks a line when swiped to the right', async () => {
    const api = setup([line(1, { label: 'Pommes' })]);
    swipe(await rowOf('Pommes'), 100);
    expect(api.patch).toHaveBeenCalledWith(1, { checked: true });
  });

  it('deletes a line when swiped to the left, with a 5 s undo that puts it back', async () => {
    const api = setup([line(1, { label: 'Pommes', quantity: 2 })]);
    swipe(await rowOf('Pommes'), -100);
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Supprimé : Pommes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Pommes', quantity: 2 }),
      ),
    );
  });

  it('keeps the buttons as the keyboard path to the same actions', async () => {
    const api = setup([line(1, { label: 'Pommes' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Pommes' }));
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Supprimé : Pommes')).toBeInTheDocument();
  });
});

describe('Courses: optimistic updates', () => {
  it('changes the quantity at once, and goes back with a message on failure', async () => {
    let release: () => void = () => undefined;
    const patch = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          release = () => reject(new ApiError(0, 'réseau'));
        }),
    );
    setup([line(1, { label: 'Pommes', quantity: 2 })], { patch } as never);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Augmenter la quantité de Pommes' }),
    );
    expect(screen.getByText(/× 3/)).toBeInTheDocument();
    release();
    expect(await screen.findByRole('alert')).toHaveTextContent('Modification impossible');
    await waitFor(() => expect(screen.getByText(/× 2/)).toBeInTheDocument());
  });

  it('shows a free line at once and removes it when the add fails', async () => {
    let release: () => void = () => undefined;
    const add = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          release = () => reject(new ApiError(0, 'réseau'));
        }),
    );
    setup([], { add } as never);
    await userEvent.type(await screen.findByLabelText('Ajouter un article'), 'Beurre');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à la liste' }));
    expect(await screen.findByText('Beurre')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByText('Beurre')).toBeNull());
    expect(screen.getByText(/Ajout impossible/)).toBeInTheDocument();
  });
});

describe('Courses: share', () => {
  it('shares the open lines with Web Share', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    setup([line(1, { label: 'Pommes', quantity: 3 }), line(2, { label: 'Pain', checked: true })]);
    await userEvent.click(await screen.findByRole('button', { name: "Plus d'actions" }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Partager la liste' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Liste de courses',
      text: 'Liste de courses\n- Pommes × 3',
    });
    expect(await screen.findByText('Liste partagée.')).toBeInTheDocument();
  });

  it('copies to the clipboard when sharing does not exist, and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setup([line(1, { label: 'Pommes' })]);
    await userEvent.click(await screen.findByRole('button', { name: "Plus d'actions" }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Partager la liste' }));
    expect(writeText).toHaveBeenCalledWith('Liste de courses\n- Pommes × 1');
    expect(await screen.findByText('Liste copiée dans le presse-papiers.')).toBeInTheDocument();
  });
});

describe('Courses: states', () => {
  it('draws an illustrated empty state', async () => {
    setup([]);
    const empty = (await screen.findByText('La liste est vide')).closest('section')!;
    expect(within(empty).getByText('La liste est vide')).toBeInTheDocument();
    expect(empty.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('offers « Réessayer » when the list cannot load', async () => {
    const fetchShopping = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'x'))
      .mockResolvedValue({ items: [] });
    setup([], { fetchShopping } as never);
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('La liste est vide')).toBeInTheDocument();
  });
});

describe('Courses: full page layout', () => {
  const recent = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      productId: i + 1,
      name: `Produit récent ${i + 1}`,
      imageUrl: null,
      count: 1,
      lastConsumedAt: '2026-11-20T10:00:00.000Z',
      locationName: null,
      sizeLabel: null,
      inStock: 0,
    }));

  it('opens « Récemment consommés » as a page from one row of the fixed header', async () => {
    setup([line(1)], { fetchRecent: vi.fn(async () => recent(8)) });
    const link = await screen.findByRole('link', { name: 'Récemment consommés' });
    expect(link).toHaveAttribute('href', '/recemment-consommes');
    expect(link.closest('header')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Produit récent 1/ })).toBeNull();
  });

  it('keeps the footer outside of the scroll zone with 30 lines', async () => {
    setup(Array.from({ length: 30 }, (_, i) => line(i + 1, { checked: i === 0 })));
    const store = await screen.findByRole('button', { name: /Ranger les articles cochés/ });
    expect(store.closest('footer')).not.toBeNull();
    const zone = screen.getByRole('region', { name: 'Liste de courses' });
    expect(zone.contains(store)).toBe(false);
    expect(zone.contains(screen.getByText('Ligne 30'))).toBe(true);
  });

  it('hides « Ranger » without checked lines', async () => {
    setup([line(1)]);
    await screen.findByText('Ligne 1');
    expect(screen.queryByRole('button', { name: /Ranger les articles cochés/ })).toBeNull();
  });

  it('opens the ⋯ menu, closes it with Escape and gives the focus back', async () => {
    const user = userEvent.setup();
    setup([line(1)]);
    const more = await screen.findByRole('button', { name: "Plus d'actions" });
    await user.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Partager la liste' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more).toHaveFocus();
  });
});
