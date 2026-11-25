import type { LocationDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type * as PlacesApi from '../../lib/places-api';
import { LocationsAdmin } from './LocationsAdmin';

const locations: LocationDto[] = [
  {
    id: 1,
    name: 'Garde-manger',
    kind: 'pantry',
    icon: 'archive',
    productCount: 0,
    sortOrder: 0,
    shelves: [
      { id: 10, locationId: 1, name: 'Haut', kind: 'plain', sortOrder: 0 },
      { id: 11, locationId: 1, name: 'Bas', kind: 'rack', sortOrder: 1 },
    ],
  },
  {
    id: 2,
    name: 'Frigo',
    kind: 'fridge',
    icon: 'snowflake',
    productCount: 0,
    sortOrder: 1,
    shelves: [],
  },
];

function makeApi(over: Partial<typeof PlacesApi> = {}): typeof PlacesApi {
  return {
    fetchLocations: vi.fn(async () => locations),
    updateLocation: vi.fn(async (id) => locations.find((l) => l.id === id)!),
    createShelf: vi.fn(async (input) => ({ id: 99, sortOrder: 2, ...input })),
    updateShelf: vi.fn(async (id) => locations[0]!.shelves.find((s) => s.id === id)!),
    deleteShelf: vi.fn(async () => undefined),
    ...over,
  };
}

async function setup(api = makeApi()) {
  render(<LocationsAdmin api={api} />);
  const pantry = await screen.findByRole('region', { name: 'Lieu Garde-manger' });
  return { api, pantry, user: userEvent.setup() };
}

describe('LocationsAdmin', () => {
  it('renames a location and changes its icon', async () => {
    const { api, pantry, user } = await setup();
    const save = within(pantry).getByRole('button', { name: 'Enregistrer le lieu' });
    expect(save).toBeDisabled();
    const name = within(pantry).getByLabelText('Nom du lieu');
    await user.clear(name);
    await user.type(name, 'Cellier');
    await user.selectOptions(within(pantry).getByLabelText('Icône du lieu'), 'wine');
    await user.click(save);
    expect(api.updateLocation).toHaveBeenCalledWith(1, { name: 'Cellier', icon: 'wine' });
    expect(await screen.findByRole('status')).toHaveTextContent('Lieu enregistré.');
  });

  it('moves a location down by renumbering only what changed', async () => {
    const { api, pantry, user } = await setup();
    await user.click(within(pantry).getByRole('button', { name: 'Descendre Garde-manger' }));
    await waitFor(() => expect(api.updateLocation).toHaveBeenCalledTimes(2));
    expect(api.updateLocation).toHaveBeenCalledWith(2, { sortOrder: 0 });
    expect(api.updateLocation).toHaveBeenCalledWith(1, { sortOrder: 1 });
    expect(within(pantry).getByRole('button', { name: 'Monter Garde-manger' })).toBeDisabled();
  });

  it('adds a shelf, refusing an empty name', async () => {
    const { api, pantry, user } = await setup();
    const form = within(pantry).getByRole('form', { name: 'Ajouter une étagère à Garde-manger' });
    await user.click(within(form).getByRole('button', { name: 'Ajouter l’étagère' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('obligatoire');
    expect(api.createShelf).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText('Nom de la nouvelle étagère'), 'Milieu');
    await user.selectOptions(within(form).getByLabelText('Type de la nouvelle étagère'), 'rack');
    await user.click(within(form).getByRole('button', { name: 'Ajouter l’étagère' }));
    expect(api.createShelf).toHaveBeenCalledWith({ locationId: 1, name: 'Milieu', kind: 'rack' });
  });

  it('renames a shelf and changes its type', async () => {
    const { api, pantry, user } = await setup();
    const row = within(pantry).getByRole('listitem', { name: 'Haut' });
    const name = within(row).getByLabelText('Nom de l’étagère');
    await user.clear(name);
    await user.type(name, 'Très haut');
    await user.selectOptions(within(row).getByLabelText('Type de l’étagère'), 'rack');
    await user.click(within(row).getByRole('button', { name: 'Enregistrer l’étagère' }));
    expect(api.updateShelf).toHaveBeenCalledWith(10, { name: 'Très haut', kind: 'rack' });
  });

  it('moves a shelf up', async () => {
    const { api, pantry, user } = await setup();
    await user.click(within(pantry).getByRole('button', { name: 'Monter Bas' }));
    await waitFor(() => expect(api.updateShelf).toHaveBeenCalledTimes(2));
    expect(api.updateShelf).toHaveBeenCalledWith(11, { sortOrder: 0 });
    expect(api.updateShelf).toHaveBeenCalledWith(10, { sortOrder: 1 });
  });

  it('asks for a confirmation that names Non rangé before deleting a shelf', async () => {
    const { api, pantry, user } = await setup();
    const row = within(pantry).getByRole('listitem', { name: 'Haut' });
    await user.click(within(row).getByRole('button', { name: 'Supprimer' }));
    expect(row).toHaveTextContent('Les produits iront dans Non rangé.');
    expect(api.deleteShelf).not.toHaveBeenCalled();
    await user.click(within(row).getByRole('button', { name: 'Annuler' }));
    expect(within(row).queryByText(/iront dans Non rangé/)).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Supprimer' }));
    await user.click(within(row).getByRole('button', { name: 'Confirmer la suppression' }));
    expect(api.deleteShelf).toHaveBeenCalledWith(10);
  });

  it('shows the API message when an action fails', async () => {
    const api = makeApi({
      updateLocation: vi.fn().mockRejectedValue(new ApiError(400, 'Lieu invalide')),
    });
    const { pantry, user } = await setup(api);
    await user.type(within(pantry).getByLabelText('Nom du lieu'), 'x');
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer le lieu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lieu invalide');
  });
});
