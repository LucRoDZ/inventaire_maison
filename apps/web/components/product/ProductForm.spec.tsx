import type { CategoryDto, LocationDto, ProductDto } from '@inventaire/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { NewProductInput } from '../../lib/products-api';
import { PHOTO_FAILED_NOTICE, ProductForm } from './ProductForm';
import { PHOTO_MAX_BYTES } from './PhotoField';

const categories: CategoryDto[] = [
  {
    id: 5,
    name: 'Épicerie sucrée',
    icon: 'candy',
    sortOrder: 1,
    isFallback: false,
    shelfLifeDays: null,
  },
  { id: 9, name: 'Autre', icon: 'package', sortOrder: 2, isFallback: true, shelfLifeDays: null },
];
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
const created = { id: 11, name: 'Confiture' } as ProductDto;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  setOnline(true);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => setOnline(true));

function renderForm(props: Partial<React.ComponentProps<typeof ProductForm>> = {}) {
  const createProduct = vi.fn<(input: NewProductInput) => Promise<ProductDto>>(async () => created);
  const uploadImage = vi.fn(async () => undefined);
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(
    <ProductForm
      barcode="3017620422003"
      reason="not_found"
      categories={categories}
      locations={locations}
      onCreated={onCreated}
      onCancel={onCancel}
      api={{ createProduct, uploadImage }}
      {...props}
    />,
  );
  return { createProduct, uploadImage, onCreated, onCancel };
}

const photo = (size = 10, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], 'photo.jpg', { type });

describe('ProductForm', () => {
  it('requires a name and a category', async () => {
    const { createProduct } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Choisissez une catégorie.')).toBeInTheDocument();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('treats a name of spaces as empty', async () => {
    const { createProduct } = renderForm();
    await userEvent.type(screen.getByLabelText('Nom'), '   ');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('creates the product with the code, then hands it over', async () => {
    const { createProduct, uploadImage, onCreated } = renderForm();
    await userEvent.type(screen.getByLabelText('Nom'), '  Confiture  ');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    await userEvent.type(screen.getByLabelText('Marque (facultative)'), 'Bonne Maman');
    await userEvent.selectOptions(screen.getByLabelText('Lieu habituel (facultatif)'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, undefined));
    expect(createProduct).toHaveBeenCalledWith({
      name: 'Confiture',
      categoryId: 5,
      brand: 'Bonne Maman',
      sizeLabel: null,
      defaultLocationId: 2,
      barcode: '3017620422003',
    });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('prefills the brand and format from the hints, and the name when given', () => {
    renderForm({
      hints: { brand: 'Ferrero', sizeLabel: '400 g', imageUrl: null },
      initialName: 'Tomates',
      barcode: null,
      reason: 'manual',
    });
    expect(screen.getByLabelText('Marque (facultative)')).toHaveValue('Ferrero');
    expect(screen.getByLabelText('Nom')).toHaveValue('Tomates');
    expect(screen.queryByText(/Code-barres :/)).toBeNull();
  });

  it('sends no barcode for a product without one', async () => {
    const { createProduct } = renderForm({
      barcode: null,
      reason: 'manual',
      initialName: 'Tomates',
    });
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    await waitFor(() => expect(createProduct).toHaveBeenCalled());
    expect(createProduct.mock.calls[0]![0]).not.toHaveProperty('barcode');
  });

  it.each([
    ['not_found', /pas dans Open Food Facts/],
    ['off_unavailable', /injoignable/],
    ['poor_data', /incomplète/],
  ] as const)('explains the %s case', (reason, message) => {
    renderForm({ reason });
    expect(screen.getByRole('note')).toHaveTextContent(message);
  });

  it('uploads the photo after the creation', async () => {
    const { uploadImage, onCreated } = renderForm();
    await userEvent.type(screen.getByLabelText('Nom'), 'Confiture');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    const file = photo();
    await userEvent.upload(screen.getByLabelText('Ajouter une photo'), file);
    expect(screen.getByAltText('Aperçu de la photo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(uploadImage).toHaveBeenCalledWith(11, file);
  });

  it('keeps the product and says so when the photo fails', async () => {
    const uploadImage = vi.fn(async () => {
      throw new ApiError(415, 'Type refusé');
    });
    const { createProduct, onCreated } = renderForm({
      api: { createProduct: vi.fn(async () => created), uploadImage },
    });
    void createProduct;
    await userEvent.type(screen.getByLabelText('Nom'), 'Confiture');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    await userEvent.upload(screen.getByLabelText('Ajouter une photo'), photo());
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created, PHOTO_FAILED_NOTICE));
  });

  it('refuses a photo that is too big or not an image', async () => {
    renderForm();
    // `accept` would already filter the PDF in the picker; the check must hold without it.
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText('Ajouter une photo');
    await user.upload(input, photo(PHOTO_MAX_BYTES + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('Photo trop lourde');
    await user.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG ou WebP');
    expect(screen.queryByAltText('Aperçu de la photo')).toBeNull();
  });

  it('shows the server message and stays open when the creation fails', async () => {
    const { onCreated } = renderForm({
      api: {
        createProduct: vi.fn(async () => {
          throw new ApiError(409, 'Ce code-barres est déjà au catalogue');
        }),
      },
    });
    await userEvent.type(screen.getByLabelText('Nom'), 'Confiture');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer et ajouter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà au catalogue');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nom')).toHaveValue('Confiture');
  });

  it('is blocked while offline and can be cancelled', async () => {
    setOnline(false);
    const { createProduct, onCancel } = renderForm();
    expect(screen.getByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(screen.getByRole('button', { name: 'Enregistrer et ajouter' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
  });
});
