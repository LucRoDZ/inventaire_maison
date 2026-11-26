import type { CategoryDto, LocationDto, ProductDto } from '@inventaire/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_LOCATION_KEY, pickInitialPlace } from '../../lib/add-place';
import { ApiError } from '../../lib/api';
import { AddSheet } from './AddSheet';
import { QuantityStepper } from './QuantityStepper';
import { UndoToast } from './UndoToast';

const locations: LocationDto[] = [
  {
    id: 1,
    name: 'Garde-manger',
    kind: 'pantry',
    icon: 'cooking-pot',
    productCount: 0,
    sortOrder: 1,
    shelves: [{ id: 10, locationId: 1, name: 'Étagère 1', kind: 'rack', sortOrder: 1 }],
  },
  {
    id: 2,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    productCount: 0,
    sortOrder: 2,
    shelves: [
      { id: 20, locationId: 2, name: 'Étagère 1', kind: 'plain', sortOrder: 1 },
      { id: 21, locationId: 2, name: 'Étagère 2', kind: 'plain', sortOrder: 2 },
    ],
  },
];
const categories: CategoryDto[] = [
  {
    id: 5,
    name: 'Produits laitiers et œufs',
    icon: 'milk',
    sortOrder: 1,
    isFallback: false,
    shelfLifeDays: null,
  },
  {
    id: 6,
    name: 'Boissons',
    icon: 'cup-soda',
    sortOrder: 2,
    isFallback: false,
    shelfLifeDays: null,
  },
  { id: 9, name: 'Autre', icon: 'package', sortOrder: 3, isFallback: true, shelfLifeDays: null },
];
const product: ProductDto = {
  id: 7,
  barcode: '3017620422003',
  name: 'Lait demi-écrémé',
  brand: 'Lactel',
  sizeLabel: '1 L',
  imageUrl: null,
  categoryId: 5,
  categoryGuessed: false,
  defaultLocationId: null,
  source: 'off',
  createdBy: 1,
  createdAt: '2026-06-01T10:00:00.000Z',
  minQuantity: null,
  amount: null,
  unit: null,
  mergedIntoId: null,
};

const adjustResult = { item: null, movement: {} } as never;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  window.localStorage.clear();
  setOnline(true);
});
afterEach(() => setOnline(true));

function renderSheet(props: Partial<React.ComponentProps<typeof AddSheet>> = {}) {
  const adjust = vi.fn(async () => adjustResult);
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <AddSheet
      product={product}
      categories={categories}
      locations={locations}
      reason="scan_add"
      adjust={adjust}
      onAdded={onAdded}
      onClose={onClose}
      {...props}
    />,
  );
  return { adjust, onAdded, onClose };
}

describe('pickInitialPlace (decision A6)', () => {
  const base = { locations, origin: null, usualLocationId: null, lastLocationId: null };

  it('prefers the furniture and shelf the scanner was opened from', () => {
    expect(
      pickInitialPlace({
        ...base,
        origin: { locationId: 2, shelfId: 21 },
        usualLocationId: 1,
        lastLocationId: 1,
      }),
    ).toEqual({ locationId: 2, shelfId: 21 });
  });

  it('drops an origin shelf that does not belong to the origin location', () => {
    expect(pickInitialPlace({ ...base, origin: { locationId: 1, shelfId: 21 } })).toEqual({
      locationId: 1,
      shelfId: null,
    });
  });

  it('then the usual location, then the last one, then the first', () => {
    expect(pickInitialPlace({ ...base, usualLocationId: 2, lastLocationId: 1 })?.locationId).toBe(
      2,
    );
    expect(pickInitialPlace({ ...base, lastLocationId: 2 })?.locationId).toBe(2);
    expect(pickInitialPlace(base)?.locationId).toBe(1);
    expect(pickInitialPlace({ ...base, usualLocationId: 99, lastLocationId: 98 })?.locationId).toBe(
      1,
    );
    expect(pickInitialPlace({ ...base, locations: [] })).toBeNull();
  });
});

describe('QuantityStepper', () => {
  it('never goes below the minimum of 1', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={2} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
    rerender(<QuantityStepper value={1} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Diminuer la quantité' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});

describe('AddSheet', () => {
  it('starts with quantity 1, no shelf, no date, and the first location', () => {
    renderSheet();
    expect(screen.getByRole('status')).toHaveTextContent('1');
    expect(screen.getByLabelText('Lieu')).toHaveValue('1');
    expect(screen.getByLabelText('Étagère')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Non rangé' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date limite (facultative)')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Lait demi-écrémé' })).toBeInTheDocument();
    expect(screen.getByText('Lactel · Produits laitiers et œufs')).toBeInTheDocument();
  });

  it('opens on the usual location of the product', () => {
    renderSheet({ product: { ...product, defaultLocationId: 2 } });
    expect(screen.getByLabelText('Lieu')).toHaveValue('2');
  });

  it('empties the shelf when the location changes', async () => {
    renderSheet({ origin: { locationId: 2, shelfId: 21 } });
    expect(screen.getByLabelText('Étagère')).toHaveValue('21');
    await userEvent.selectOptions(screen.getByLabelText('Lieu'), '1');
    expect(screen.getByLabelText('Étagère')).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Étagère 2' })).toBeNull();
  });

  it('sends the add and reports a message with the shelf', async () => {
    const { adjust, onAdded } = renderSheet({ origin: { locationId: 2, shelfId: 21 } });
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await userEvent.type(screen.getByLabelText('Date limite (facultative)'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(adjust).toHaveBeenCalledWith({
      productId: 7,
      locationId: 2,
      shelfId: 21,
      expiryDate: '2026-12-01',
      delta: 2,
      reason: 'scan_add',
    });
    expect(onAdded.mock.calls[0]![0].message).toBe(
      'Ajouté : 2 × Lait demi-écrémé, Frigo, étagère 2',
    );
    expect(onAdded.mock.calls[0]![1]).toBe(false);
    expect(window.localStorage.getItem(LAST_LOCATION_KEY)).toBe('2');
  });

  it('omits the shelf from the message when the product is not shelved', async () => {
    const { onAdded } = renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0]![0].message).toBe('Ajouté : 1 × Lait demi-écrémé, Garde-manger');
  });

  it('asks to scan the next one with the second button', async () => {
    const { onAdded } = renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter et scanner le suivant' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0]![1]).toBe(true);
  });

  it('uses the manual reason for an add by name', async () => {
    const { adjust, onAdded } = renderSheet({ reason: 'manual' });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ reason: 'manual' }));
  });

  it('undoes with an opposite correction movement', async () => {
    const { adjust, onAdded } = renderSheet({ origin: { locationId: 2, shelfId: 20 } });
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());

    await onAdded.mock.calls[0]![0].undo();
    expect(adjust).toHaveBeenLastCalledWith({
      productId: 7,
      locationId: 2,
      shelfId: 20,
      expiryDate: null,
      delta: -2,
      reason: 'correction',
    });
  });

  it('stays open with the server message when the add fails', async () => {
    const adjust = vi.fn(async () => {
      throw new ApiError(409, 'Stock insuffisant');
    });
    const { onAdded, onClose } = renderSheet({ adjust });
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuffisant');
    expect(onAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Nothing typed is lost and the button is usable again.
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
  });

  it('shows a network message when the server cannot be reached', async () => {
    const adjust = vi.fn(async () => {
      throw new ApiError(0, 'Impossible de joindre le serveur');
    });
    renderSheet({ adjust });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vérifiez la connexion');
  });

  it('is blocked, with a message, while offline', () => {
    setOnline(false);
    const { adjust } = renderSheet();
    expect(screen.getByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter et scanner le suivant' })).toBeDisabled();
    expect(adjust).not.toHaveBeenCalled();
  });

  it('closes with Fermer', async () => {
    const { onClose } = renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddSheet category', () => {
  const guessed: ProductDto = { ...product, categoryId: 9, categoryGuessed: true };

  it('shows the picker for a guessed category: proposed one selected and tagged', () => {
    renderSheet({ product: guessed });
    const group = screen.getByRole('radiogroup', { name: 'Catégorie proposée' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getByRole('radio', { name: /Autre/ })).toBeChecked();
    expect(within(group).getByText('Proposée')).toBeInTheDocument();
  });

  it('confirms the proposed category when the product is added, before the stock', async () => {
    const confirmCategory = vi.fn(async () => ({}));
    const { adjust } = renderSheet({ product: guessed, confirmCategory });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(adjust).toHaveBeenCalled());
    expect(confirmCategory).toHaveBeenCalledWith(7, 9);
    expect(confirmCategory.mock.invocationCallOrder[0]!).toBeLessThan(
      adjust.mock.invocationCallOrder[0]!,
    );
  });

  it('saves the category picked instead of the proposed one, in a single request', async () => {
    const confirmCategory = vi.fn(async () => ({}));
    renderSheet({ product: guessed, confirmCategory });
    await userEvent.click(screen.getByRole('radio', { name: /Boissons/ }));
    expect(confirmCategory).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Boissons/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(confirmCategory).toHaveBeenCalledTimes(1));
    expect(confirmCategory).toHaveBeenCalledWith(7, 6);
  });

  it('does not add the stock when the category cannot be saved', async () => {
    const confirmCategory = vi.fn(async () => {
      throw new ApiError(500, 'Erreur du serveur');
    });
    const { adjust, onAdded } = renderSheet({ product: guessed, confirmCategory });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
    expect(adjust).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('shows a worthwhile proposal as one line, and opens the grid from « Changer la catégorie »', async () => {
    const confirmCategory = vi.fn(async () => ({}));
    const proposal: ProductDto = { ...product, categoryId: 6, categoryGuessed: true };
    const { adjust } = renderSheet({ product: proposal, confirmCategory });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText(/Catégorie proposée :/)).toHaveTextContent('Boissons');
    // Added as is: the proposal shown is confirmed.
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(adjust).toHaveBeenCalled());
    expect(confirmCategory).toHaveBeenCalledWith(7, 6);
  });

  it('opens the grid on the proposal, still tagged, from « Changer la catégorie »', async () => {
    const proposal: ProductDto = { ...product, categoryId: 6, categoryGuessed: true };
    renderSheet({ product: proposal });
    await userEvent.click(screen.getByRole('button', { name: 'Changer la catégorie' }));
    const group = screen.getByRole('radiogroup', { name: 'Catégorie proposée' });
    expect(within(group).getByRole('radio', { name: /Boissons/ })).toBeChecked();
    expect(within(group).getByText('Proposée')).toBeInTheDocument();
  });

  it('keeps a confirmed category quiet, with a button to change it', async () => {
    const confirmCategory = vi.fn(async () => ({}));
    const { adjust } = renderSheet({ confirmCategory });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    // Added as is: no category request.
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(adjust).toHaveBeenCalled());
    expect(confirmCategory).not.toHaveBeenCalled();
  });

  it('opens the picker from « Changer la catégorie » and saves the new category', async () => {
    const confirmCategory = vi.fn(async () => ({}));
    renderSheet({ confirmCategory });
    await userEvent.click(screen.getByRole('button', { name: 'Changer la catégorie' }));
    const group = screen.getByRole('radiogroup', { name: 'Catégorie' });
    expect(within(group).queryByText('Proposée')).toBeNull();
    await userEvent.click(within(group).getByRole('radio', { name: /Boissons/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(confirmCategory).toHaveBeenCalledWith(7, 6));
  });
});

describe('UndoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('offers Annuler for 5 s then expires', () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    render(<UndoToast message="Ajouté : 1 × Lait" onUndo={onUndo} onExpire={onExpire} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ajouté : 1 × Lait');
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('calls onUndo when Annuler is tapped', () => {
    const onUndo = vi.fn();
    render(<UndoToast message="x" onUndo={onUndo} onExpire={() => undefined} />);
    screen.getByRole('button', { name: 'Annuler' }).click();
    expect(onUndo).toHaveBeenCalled();
  });
});
