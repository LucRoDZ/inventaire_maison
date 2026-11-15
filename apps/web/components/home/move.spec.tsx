import type { HomeTileDto, LocationDto } from '@inventaire/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { MoveDialog, type MoveSource } from './MoveDialog';
import { ProductSheet } from './ProductSheet';

const locations: LocationDto[] = [
  {
    id: 1,
    name: 'Garde-manger',
    kind: 'pantry',
    icon: 'warehouse',
    sortOrder: 1,
    shelves: [{ id: 10, locationId: 1, name: 'Étagère 1', kind: 'plain', sortOrder: 1 }],
  },
  {
    id: 2,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    sortOrder: 2,
    shelves: [
      { id: 20, locationId: 2, name: 'Étagère 1', kind: 'plain', sortOrder: 1 },
      { id: 21, locationId: 2, name: 'Étagère 2', kind: 'plain', sortOrder: 2 },
    ],
  },
];
const source: MoveSource = {
  stockItemId: 5,
  productName: 'Lait',
  locationId: 2,
  shelfId: 20,
  quantity: 4,
};

function setup(over: Partial<React.ComponentProps<typeof MoveDialog>> = {}) {
  const move = vi.fn(async () => ({}) as never);
  const onMoved = vi.fn();
  const onClose = vi.fn();
  render(
    <MoveDialog
      source={source}
      locations={locations}
      move={move}
      onMoved={onMoved}
      onClose={onClose}
      {...over}
    />,
  );
  return { move, onMoved, onClose };
}

describe('MoveDialog', () => {
  it('starts on the current place, whole line, and blocks an identical destination', async () => {
    const { move } = setup();
    expect(screen.getByLabelText('Meuble')).toHaveValue('2');
    expect(screen.getByLabelText('Étagère')).toHaveValue('20');
    expect(screen.getByText(/C’est déjà là/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeDisabled();
    expect(screen.getByLabelText('Quantité')).toHaveTextContent('4');
    expect(move).not.toHaveBeenCalled();
  });

  it('moves the whole line to another shelf and confirms', async () => {
    const { move, onMoved } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Étagère'), '21');
    expect(screen.queryByText(/C’est déjà là/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(move).toHaveBeenCalledWith({
      stockItemId: 5,
      toLocationId: 2,
      toShelfId: 21,
      quantity: 4,
    });
    await waitFor(() =>
      expect(onMoved).toHaveBeenCalledWith('Déplacé : 4 × Lait vers Frigo, étagère 2'),
    );
  });

  it('sends the tray of another furniture when no shelf is chosen', async () => {
    const { move, onMoved } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Meuble'), '1');
    expect(screen.getByLabelText('Étagère')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(move).toHaveBeenCalledWith({
      stockItemId: 5,
      toLocationId: 1,
      toShelfId: null,
      quantity: 4,
    });
    await waitFor(() =>
      expect(onMoved).toHaveBeenCalledWith('Déplacé : 4 × Lait vers Garde-manger'),
    );
  });

  it('moves only part of the line', async () => {
    const { move } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Étagère'), '21');
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
  });

  it('does not offer more than the line holds', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Augmenter la quantité' })).toBeDisabled();
  });

  it('hides the quantity for a single unit', () => {
    setup({ source: { ...source, quantity: 1 } });
    expect(screen.queryByLabelText('Quantité')).toBeNull();
  });

  it('shows the server message on a 409 and stays open', async () => {
    const { onMoved, onClose } = setup({
      move: vi.fn(async () => {
        throw new ApiError(409, 'Stock insuffisant');
      }),
    });
    await userEvent.selectOptions(screen.getByLabelText('Étagère'), '21');
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuffisant');
    expect(onMoved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeEnabled();
  });
});

describe('ProductSheet', () => {
  const tile: HomeTileDto = {
    stockItemId: 5,
    productId: 50,
    name: 'Lait',
    imageUrl: null,
    category: { id: 1, name: 'Boissons', icon: 'milk' },
    quantity: 2,
    expiryDate: '2026-12-01',
    expiry: { status: 'soon', days: 3 },
  };
  const place = { locationId: 2, shelfId: 20, locationName: 'Frigo', shelfName: 'Étagère 1' };

  function sheet(over: Partial<React.ComponentProps<typeof ProductSheet>> = {}) {
    const adjust = vi.fn(async () => ({}) as never);
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(
      <ProductSheet
        tile={tile}
        place={place}
        locations={locations}
        onChanged={onChanged}
        onClose={onClose}
        api={{ adjust }}
        {...over}
      />,
    );
    return { adjust, onChanged, onClose };
  }

  it('shows the product, its place, its expiry date with the badge, and the product page link', () => {
    sheet();
    expect(screen.getByRole('heading', { name: 'Lait' })).toBeInTheDocument();
    expect(screen.getByText('Frigo, Étagère 1')).toBeInTheDocument();
    expect(screen.getByText(/Date limite : 1 décembre 2026/)).toBeInTheDocument();
    expect(screen.getByText('J-3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir la fiche produit' })).toHaveAttribute(
      'href',
      '/produits/50',
    );
  });

  it('adds and removes a unit on this very line', async () => {
    const { adjust, onChanged } = sheet();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une unité' }));
    expect(adjust).toHaveBeenCalledWith({
      productId: 50,
      locationId: 2,
      shelfId: 20,
      expiryDate: '2026-12-01',
      delta: 1,
      reason: 'manual',
    });
    await waitFor(() => expect(screen.getByLabelText('Quantité en stock')).toHaveTextContent('3'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('closes itself when the last unit is removed', async () => {
    const { onClose } = sheet({ tile: { ...tile, quantity: 1 } });
    await userEvent.click(screen.getByRole('button', { name: 'Retirer une unité' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps the quantity and says why when the server refuses', async () => {
    sheet({
      api: {
        adjust: vi.fn(async () => {
          throw new ApiError(409, 'Stock insuffisant');
        }),
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Retirer une unité' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuffisant');
    expect(screen.getByLabelText('Quantité en stock')).toHaveTextContent('2');
  });

  it('opens « Déplacer vers… » and reports the confirmation', async () => {
    const move = vi.fn(async () => ({}) as never);
    const { onChanged, onClose } = sheet({ api: { move } });
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer vers…' }));
    await userEvent.selectOptions(screen.getByLabelText('Étagère'), '21');
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith('Déplacé : 2 × Lait vers Frigo, étagère 2'),
    );
    expect(move).toHaveBeenCalledWith({
      stockItemId: 5,
      toLocationId: 2,
      toShelfId: 21,
      quantity: 2,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
