import type {
  CategoryDto,
  LocationDto,
  MovementHistoryItemDto,
  ProductDto,
  ProductStockByLocationDto,
} from '@inventaire/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { MovementList } from './MovementList';
import { ProductEdit } from './ProductEdit';
import { StockByLocation } from './StockByLocation';

const categories: CategoryDto[] = [
  { id: 1, name: 'Laitier', icon: 'milk', sortOrder: 1, isFallback: false, shelfLifeDays: null },
  { id: 2, name: 'Autre', icon: 'package', sortOrder: 2, isFallback: true, shelfLifeDays: null },
];
const locations: LocationDto[] = [
  { id: 5, name: 'Frigo', kind: 'fridge', icon: 'x', productCount: 0, sortOrder: 1, shelves: [] },
];
const product: ProductDto = {
  id: 7,
  barcode: '3017620422003',
  name: 'Lait',
  brand: 'Lactel',
  sizeLabel: null,
  imageUrl: null,
  categoryId: 2,
  categoryGuessed: true,
  defaultLocationId: null,
  source: 'off',
  createdBy: 1,
  createdAt: '2026-06-01T10:00:00.000Z',
  minQuantity: null,
  amount: null,
  unit: null,
  mergedIntoId: null,
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('ProductEdit', () => {
  function setup(over: Partial<React.ComponentProps<typeof ProductEdit>> = {}) {
    const update = vi.fn(async () => ({ ...product, name: 'Lait entier' }));
    const upload = vi.fn(async () => product);
    const onSaved = vi.fn();
    render(
      <ProductEdit
        product={product}
        categories={categories}
        locations={locations}
        onSaved={onSaved}
        api={{ update, upload }}
        {...over}
      />,
    );
    return { update, upload, onSaved };
  }

  it('starts with the values of the product', () => {
    setup();
    expect(screen.getByLabelText('Nom')).toHaveValue('Lait');
    expect(screen.getByLabelText('Marque (facultative)')).toHaveValue('Lactel');
    expect(screen.getByLabelText('Catégorie')).toHaveValue('2');
    expect(screen.getByLabelText('Lieu habituel (facultatif)')).toHaveValue('');
  });

  it('saves every field, always with the category (which confirms it)', async () => {
    const { update, onSaved } = setup();
    await userEvent.clear(screen.getByLabelText('Nom'));
    await userEvent.type(screen.getByLabelText('Nom'), 'Lait entier');
    await userEvent.clear(screen.getByLabelText('Marque (facultative)'));
    await userEvent.selectOptions(screen.getByLabelText('Lieu habituel (facultatif)'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      name: 'Lait entier',
      brand: null,
      categoryId: 2,
      defaultLocationId: 5,
    });
    expect(screen.getByText('Produit enregistré.')).toBeInTheDocument();
  });

  it('refuses an empty name', async () => {
    const { update } = setup();
    await userEvent.clear(screen.getByLabelText('Nom'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('uploads the photo after the save', async () => {
    const { upload } = setup();
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Ajouter une photo'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith(7, file));
  });

  it('says the product is saved but the photo is not when only the photo fails', async () => {
    const { onSaved } = setup({
      api: {
        update: vi.fn(async () => product),
        upload: vi.fn(async () => {
          throw new ApiError(415, 'Type refusé');
        }),
      },
    });
    await userEvent.upload(
      screen.getByLabelText('Ajouter une photo'),
      new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Produit enregistré, mais la photo');
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the server message when the save fails', async () => {
    setup({
      api: {
        update: vi.fn(async () => {
          throw new ApiError(404, 'Catégorie introuvable');
        }),
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catégorie introuvable');
  });
});

describe('StockByLocation', () => {
  const stock: ProductStockByLocationDto[] = [
    {
      locationId: 5,
      locationName: 'Frigo',
      quantity: 3,
      lines: [
        { id: 1, shelfId: 21, shelfName: 'Étagère 2', quantity: 2, expiryDate: '2026-12-01' },
        { id: 2, shelfId: null, shelfName: null, quantity: 1, expiryDate: null },
      ],
    },
  ];

  it('lists the furniture, the shelves and the dates', () => {
    render(<StockByLocation stock={stock} />);
    expect(screen.getByText('Frigo : 3 unités')).toBeInTheDocument();
    expect(screen.getByText('Étagère 2 · 2 unités · limite le 01/12/2026')).toBeInTheDocument();
    expect(screen.getByText('Non rangé · 1 unité')).toBeInTheDocument();
  });

  it('says so when nothing is in stock', () => {
    render(<StockByLocation stock={[]} />);
    expect(screen.getByText('Ce produit n’est pas en stock.')).toBeInTheDocument();
  });
});

describe('MovementList', () => {
  const move = (id: number, username: string): MovementHistoryItemDto => ({
    id,
    delta: 1,
    reason: 'manual',
    expiryDate: null,
    createdAt: '2026-06-01T10:02:00.000Z',
    user: { id: id, username },
    location: { id: 5, name: 'Frigo' },
    shelf: null,
  });

  it('loads the first page, then the next one on demand', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [move(3, 'lucas'), move(2, 'marie')], nextCursor: '2' })
      .mockResolvedValueOnce({ items: [move(1, 'paul')], nextCursor: null });
    render(<MovementList productId={7} load={load} />);
    expect(
      await screen.findByText(/lucas a ajouté 1 unité dans Frigo, non rangé/),
    ).toBeInTheDocument();
    expect(screen.getByText(/marie a ajouté/)).toBeInTheDocument();
    expect(screen.queryByText(/paul a ajouté/)).toBeNull();
    expect(load).toHaveBeenCalledWith(7, null);

    await userEvent.click(screen.getByRole('button', { name: 'Voir plus' }));
    expect(await screen.findByText(/paul a ajouté/)).toBeInTheDocument();
    expect(load).toHaveBeenLastCalledWith(7, '2');
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('says there is no movement yet', async () => {
    render(<MovementList productId={7} load={async () => ({ items: [], nextCursor: null })} />);
    expect(await screen.findByText('Aucun mouvement pour l’instant.')).toBeInTheDocument();
  });

  it('offers to retry when loading fails', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce({ items: [move(1, 'lucas')], nextCursor: null });
    render(<MovementList productId={7} load={load} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Historique indisponible');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/lucas a ajouté/)).toBeInTheDocument();
  });
});
