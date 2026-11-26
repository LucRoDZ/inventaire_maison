import type {
  CategoryDto,
  LocationDto,
  ProductDto,
  ProductMergeResponse,
} from '@inventaire/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { MergeProduct } from './MergeProduct';
import { ProductEdit } from './ProductEdit';
import { ProductForm } from './ProductForm';
import { ProductPicker } from './ProductPicker';

const categories: CategoryDto[] = [
  { id: 2, name: 'Laitier', icon: 'milk', sortOrder: 1, isFallback: false, shelfLifeDays: null },
];
const locations: LocationDto[] = [];
const product = {
  id: 7,
  name: 'Lait',
  brand: null,
  categoryId: 2,
  defaultLocationId: null,
  minQuantity: null,
  amount: null,
  unit: null,
} as unknown as ProductDto;
const other = { id: 8, name: 'Lait demi-écrémé', brand: 'Lactel' } as unknown as ProductDto;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('ProductPicker', () => {
  it('searches, hides the excluded product and returns the one tapped', async () => {
    const onPick = vi.fn();
    const search = vi.fn(async () => [product, other]);
    render(
      <ProductPicker
        title="Choisir"
        excludeId={7}
        search={search}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Nom du produit'), 'lait');
    const result = await screen.findByRole('button', { name: /Lait demi-écrémé/ });
    expect(screen.queryByRole('button', { name: /^Lait$/ })).toBeNull();
    await userEvent.click(result);
    expect(onPick).toHaveBeenCalledWith(other);
  });

  it('says when nothing matches and when the search fails', async () => {
    const { unmount } = render(
      <ProductPicker title="Choisir" search={async () => []} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Nom du produit'), 'zzz');
    expect(await screen.findByText(/Aucun produit trouvé/)).toBeInTheDocument();
    unmount();
    render(
      <ProductPicker
        title="Choisir"
        search={async () => {
          throw new Error('x');
        }}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Nom du produit'), 'zzz');
    expect(await screen.findByRole('alert')).toHaveTextContent('La recherche a échoué');
  });
});

describe('MergeProduct', () => {
  const result = { kept: other, movedUnits: 3, movedLines: 1, movedShoppingItems: 0 };

  async function pickTarget() {
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner avec…' }));
    await userEvent.type(screen.getByLabelText('Nom du produit'), 'lait');
    await userEvent.click(await screen.findByRole('button', { name: /Lait demi-écrémé/ }));
  }

  it('states what will be merged and merges only after the confirmation', async () => {
    const merge = vi.fn<(id: number, into: number) => Promise<ProductMergeResponse>>(
      async () => result,
    );
    const onMerged = vi.fn();
    render(
      <MergeProduct
        product={product}
        onMerged={onMerged}
        api={{ merge, search: async () => [other] }}
      />,
    );
    await pickTarget();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Le stock, les lignes de courses et l’historique de « Lait »');
    expect(dialog).toHaveTextContent('« Lait demi-écrémé »');
    expect(merge).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Fusionner dans/ }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith(7, 8));
    expect(onMerged).toHaveBeenCalledWith(result);
  });

  it('shows the refusal of the server and keeps the dialog', async () => {
    const merge = vi.fn(async () => {
      throw new ApiError(409, 'Déjà fusionné');
    });
    render(
      <MergeProduct
        product={product}
        onMerged={vi.fn()}
        api={{ merge, search: async () => [other] }}
      />,
    );
    await pickTarget();
    await userEvent.click(screen.getByRole('button', { name: /Fusionner dans/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Déjà fusionné');
  });
});

describe('ProductEdit minimum and content', () => {
  function setup() {
    const update = vi.fn(async () => product);
    render(
      <ProductEdit
        product={product}
        categories={categories}
        locations={locations}
        onSaved={vi.fn()}
        api={{ update }}
      />,
    );
    return update;
  }

  it('sends the minimum and the content only when they changed', async () => {
    const update = setup();
    await userEvent.type(screen.getByLabelText('Stock minimum (facultatif)'), '2');
    await userEvent.type(screen.getByLabelText('Quantité nette'), '1,5');
    await userEvent.selectOptions(screen.getByLabelText('Unité'), 'l');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ minQuantity: 2, amount: 1.5, unit: 'l' }),
    );
  });

  it('refuses a bad minimum under the field', async () => {
    const update = setup();
    await userEvent.type(screen.getByLabelText('Stock minimum (facultatif)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('entre 1 et 999');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ProductForm content and rescan', () => {
  it('saves the content right after the creation and offers to rescan the code', async () => {
    const created = { id: 11, name: 'Confiture' } as ProductDto;
    const createProduct = vi.fn(async () => created);
    const updateProduct = vi.fn(async () => undefined);
    const onRescan = vi.fn();
    const onCreated = vi.fn();
    render(
      <ProductForm
        barcode="3017620422003"
        reason="not_found"
        categories={categories}
        locations={locations}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onRescan={onRescan}
        api={{ createProduct, updateProduct, uploadImage: vi.fn() }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rescanner' }));
    expect(onRescan).toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Nom'), 'Confiture');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '2');
    await userEvent.type(screen.getByLabelText('Quantité nette'), '370');
    await userEvent.selectOptions(screen.getByLabelText('Unité'), 'g');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(updateProduct).toHaveBeenCalledWith(11, { amount: 370, unit: 'g' });
  });
});
