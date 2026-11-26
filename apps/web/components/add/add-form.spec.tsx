import type { CategoryDto, LocationDto, ProductDto } from '@inventaire/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDaysIso, todayIso } from '../../lib/dates';
import { AddSheet } from './AddSheet';

const locations: LocationDto[] = [
  {
    id: 1,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    productCount: 0,
    sortOrder: 1,
    shelves: [],
  },
];
const dairy: CategoryDto = {
  id: 5,
  name: 'Laitier',
  icon: 'milk',
  sortOrder: 1,
  isFallback: false,
  shelfLifeDays: 5,
};
const dry: CategoryDto = {
  id: 6,
  name: 'Épicerie',
  icon: 'package',
  sortOrder: 2,
  isFallback: false,
  shelfLifeDays: null,
};
const product = (categoryId: number): ProductDto =>
  ({
    id: 7,
    name: 'Yaourt',
    brand: null,
    imageUrl: null,
    categoryId,
    categoryGuessed: false,
    defaultLocationId: null,
    amount: null,
    unit: null,
  }) as unknown as ProductDto;

function setup(categoryId = 5) {
  const adjust = vi.fn(async () => ({ item: null, movement: {} }) as never);
  const saveProduct = vi.fn(async () => ({}));
  const onAdded = vi.fn();
  render(
    <AddSheet
      product={product(categoryId)}
      categories={[dairy, dry]}
      locations={locations}
      reason="scan_add"
      adjust={adjust}
      saveProduct={saveProduct}
      onAdded={onAdded}
      onClose={vi.fn()}
    />,
  );
  return { adjust, saveProduct, onAdded };
}

beforeEach(() => window.localStorage.clear());

describe('AddSheet expiry suggestion and content', () => {
  it('proposes purchase date + shelf life, marked « Suggérée », and saves it as shown', async () => {
    const { adjust } = setup();
    const expected = addDaysIso(todayIso(), 5);
    expect(screen.getByLabelText('Date d’achat')).toHaveValue(todayIso());
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue(expected);
    expect(screen.getByText('Suggérée')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ expiryDate: expected })),
    );
  });

  it('follows the purchase date while it is only a suggestion', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Date d’achat'), { target: { value: '2026-01-10' } });
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue('2026-01-15');
  });

  it('never overrides a date the person typed, and drops the mention', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Date limite (facultative)'), {
      target: { value: '2027-03-01' },
    });
    expect(screen.queryByText('Suggérée')).toBeNull();
    fireEvent.change(screen.getByLabelText('Date d’achat'), { target: { value: '2026-01-10' } });
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue('2027-03-01');
  });

  it('clears the suggestion in one gesture and does not bring it back', async () => {
    const { adjust } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Pas de date' }));
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue('');
    expect(screen.queryByText('Suggérée')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ expiryDate: null })),
    );
  });

  it('proposes nothing when the category has no shelf life', () => {
    setup(6);
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue('');
    expect(screen.queryByText('Suggérée')).toBeNull();
  });

  it('asks for the unit under the field and adds nothing while the content is incomplete', async () => {
    const { adjust } = setup(6);
    await userEvent.type(screen.getByLabelText('Quantité nette'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une unité');
    expect(adjust).not.toHaveBeenCalled();
  });

  it('saves the content on the product before the stock', async () => {
    const { adjust, saveProduct } = setup(6);
    await userEvent.type(screen.getByLabelText('Quantité nette'), '226,8');
    await userEvent.selectOptions(screen.getByLabelText('Unité'), 'g');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(adjust).toHaveBeenCalled());
    expect(saveProduct).toHaveBeenCalledWith(7, { amount: 226.8, unit: 'g' });
  });
});
