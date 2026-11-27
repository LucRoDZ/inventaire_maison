import type { ProductDto, ShoppingItemCreateInput, ShoppingItemDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { shoppingQuantityText } from '../../lib/shopping-api';
import { QuickEntry } from './QuickEntry';
import { ShoppingList, type ShoppingApi } from './ShoppingList';

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

const product = (id: number, name: string): ProductDto =>
  ({ id, name, brand: null }) as unknown as ProductDto;

/** A tiny fake server: the list lives in `current`, every call changes it. */
function setup(initial: ShoppingItemDto[], over: Partial<ShoppingApi> = {}) {
  let current = initial;
  const api = {
    fetchShopping: vi.fn(async () => ({ items: current })),
    add: vi.fn(async (input) => {
      current = [
        ...current,
        line(100 + current.length, {
          label: input.label ?? null,
          quantity: input.quantity ?? 1,
          product: input.productId
            ? { id: input.productId, name: 'Lait', imageUrl: null, defaultLocationId: 1 }
            : null,
        }),
      ];
    }),
    patch: vi.fn(async (id: number, patch: { checked?: boolean; quantity?: number }) => {
      current = current.map((l) => (l.id === id ? { ...l, ...patch } : l));
    }),
    remove: vi.fn(async (id: number) => {
      current = current.filter((l) => l.id !== id);
    }),
    clearChecked: vi.fn(async () => {
      const removed = current.filter((l) => l.checked).length;
      current = current.filter((l) => !l.checked);
      return { removed };
    }),
    storeChecked: vi.fn(async () => ({ stored: [], needsForm: [] })),
    fetchRecent: vi.fn(async () => []),
    adjust: vi.fn(async () => ({}) as never),
    ...over,
  } as unknown as ShoppingApi;
  render(<ShoppingList api={api} />);
  return api;
}

describe('ShoppingList', () => {
  it('shows a neat empty state', async () => {
    setup([]);
    expect(await screen.findByText('La liste est vide')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ranger/ })).toBeNull();
  });

  it('lists the lines with their quantity and checks one', async () => {
    const api = setup([
      line(1, { label: 'Pommes', quantity: 3 }),
      line(2, { label: 'Farine', amount: 500, unit: 'g' }),
    ]);
    expect(await screen.findByText('Pommes')).toBeInTheDocument();
    expect(screen.getByText(/× 3/)).toBeInTheDocument();
    expect(screen.getByText(/× 1 · 500 g/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Pommes/ }));
    expect(api.patch).toHaveBeenCalledWith(1, { checked: true });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Pommes/ })).toBeChecked());
  });

  it('changes the quantity of a line and removes it', async () => {
    const api = setup([line(1, { label: 'Pommes', quantity: 3 })]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Augmenter la quantité de Pommes' }),
    );
    expect(api.patch).toHaveBeenCalledWith(1, { quantity: 4 });
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Pommes' }));
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(await screen.findByText('La liste est vide')).toBeInTheDocument();
  });

  it('empties the checked lines only', async () => {
    const api = setup([line(1, { checked: true }), line(2)]);
    await screen.findByText('Ligne 1');
    await userEvent.click(screen.getByRole('button', { name: "Plus d'actions" }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Vider les lignes cochées' }));
    expect(api.clearChecked).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Ligne 1')).toBeNull());
    expect(screen.getByText('Ligne 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Plus d'actions" }));
    expect(screen.getByRole('menuitem', { name: 'Vider les lignes cochées' })).toBeDisabled();
  });

  it('adds a recently consumed product with one tap', async () => {
    const api = setup([], {
      fetchRecent: vi.fn(async () => [
        {
          productId: 9,
          name: 'Lait',
          imageUrl: null,
          count: 4,
          lastConsumedAt: '2026-11-20T10:00:00.000Z',
          locationName: null,
          sizeLabel: null,
          inStock: 0,
        },
      ]),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter Lait à la liste' }));
    expect(api.add).toHaveBeenCalledWith({ productId: 9 });
  });

  it('stores the checked lines, then undoes with the opposite delta and re-adds the lines', async () => {
    const stored = {
      shoppingItemId: 1,
      productId: 9,
      productName: 'Lait',
      quantity: 2,
      locationId: 3,
      stockItemId: 40,
    };
    const api = setup([line(1, { checked: true })], {
      storeChecked: vi.fn(async () => ({ stored: [stored], needsForm: [] })),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Ranger les articles cochés/ }),
    );
    const toast = (await screen.findByText('1 article rangé dans le stock')).closest(
      '[role="status"]',
    )!;
    await userEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Annuler' }));
    await waitFor(() =>
      expect(api.adjust).toHaveBeenCalledWith({
        productId: 9,
        locationId: 3,
        delta: -2,
        reason: 'correction',
      }),
    );
    expect(api.add).toHaveBeenCalledWith({ productId: 9, quantity: 2 });
  });

  it('lists the lines that need the form after storing', async () => {
    setup([line(1, { checked: true, label: 'Tomates' })], {
      storeChecked: vi.fn(async () => ({
        stored: [],
        needsForm: [line(1, { checked: true, label: 'Tomates' })],
      })),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Ranger les articles cochés/ }),
    );
    expect(await screen.findByRole('heading', { name: 'À ranger à la main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tomates\s*Ranger/ })).toBeInTheDocument();
  });

  it('says why the list cannot be loaded', async () => {
    setup([], {
      fetchShopping: vi.fn(async () => {
        throw new ApiError(500, 'Erreur du serveur');
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
  });
});

describe('QuickEntry', () => {
  it('reads the quantity and adds a free line on Enter', async () => {
    const onAdd = vi.fn<(input: ShoppingItemCreateInput) => Promise<void>>(async () => undefined);
    render(<QuickEntry onAdd={onAdd} search={async () => []} />);
    await userEvent.type(screen.getByLabelText('Ajouter un article'), '3 pommes{Enter}');
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringContaining('pommes') }),
    );
  });

  it('never adds to a catalogue product on its own: only suggests it', async () => {
    const onAdd = vi.fn<(input: ShoppingItemCreateInput) => Promise<void>>(async () => undefined);
    render(<QuickEntry onAdd={onAdd} search={async () => [product(7, 'Pommes Gala')]} />);
    await userEvent.type(screen.getByLabelText('Ajouter un article'), 'pommes');
    const suggestion = await screen.findByRole('button', { name: 'Pommes Gala' });
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.click(suggestion);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: 7 }));
    expect(onAdd.mock.calls[0]![0]).not.toHaveProperty('label');
  });

  it('keeps a free line when the suggestion is ignored', async () => {
    const onAdd = vi.fn<(input: ShoppingItemCreateInput) => Promise<void>>(async () => undefined);
    render(<QuickEntry onAdd={onAdd} search={async () => [product(7, 'Pommes Gala')]} />);
    await userEvent.type(screen.getByLabelText('Ajouter un article'), 'pommes');
    await screen.findByRole('button', { name: 'Pommes Gala' });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à la liste' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ label: 'pommes' }));
    expect(onAdd.mock.calls[0]![0]).not.toHaveProperty('productId');
  });

  it('asks for a text under the field when it is empty, and shows a server refusal', async () => {
    const onAdd = vi.fn<(input: ShoppingItemCreateInput) => Promise<void>>(async () => {
      throw new Error('Ligne refusée');
    });
    render(<QuickEntry onAdd={onAdd} search={async () => []} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à la liste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Écrivez ce qu’il faut acheter');
    await userEvent.type(screen.getByLabelText('Ajouter un article'), 'beurre{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ligne refusée');
  });
});

describe('shoppingQuantityText', () => {
  it('says the amount only when there is a real unit', () => {
    expect(shoppingQuantityText({ quantity: 2, amount: null, unit: null })).toBe('× 2');
    expect(shoppingQuantityText({ quantity: 1, amount: 1.5, unit: 'l' })).toBe('× 1 · 1,5 l');
    expect(shoppingQuantityText({ quantity: 1, amount: 6, unit: 'unit' })).toBe('× 1');
  });
});
