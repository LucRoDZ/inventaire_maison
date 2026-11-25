import type { LocationDto } from '@inventaire/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type * as PlacesApi from '../../lib/places-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
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
    createLocation: vi.fn(async (input) => ({
      id: 3,
      icon: 'refrigerator',
      sortOrder: 2,
      shelves: [],
      productCount: 0,
      kind: input.kind,
      name: input.name,
    })),
    deleteLocation: vi.fn(async () => undefined),
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

  it('moves a piece of furniture at once and puts it back when the server refuses', async () => {
    const api = makeApi({
      updateLocation: vi.fn(async () => {
        throw new ApiError(500, 'Erreur du serveur');
      }),
    });
    const { user } = await setup(api);
    const names = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(names()).toEqual(['Lieu Garde-manger', 'Lieu Frigo']);
    await user.click(screen.getByRole('button', { name: 'Descendre Garde-manger' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
    expect(names()).toEqual(['Lieu Garde-manger', 'Lieu Frigo']);
  });

  it('adds a piece of furniture from the same sheet as the home screen, then goes back home', async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Ajouter un meuble' }));
    const sheet = screen.getByRole('dialog', { name: 'Ajouter un meuble' });
    expect(within(sheet).getByLabelText('Nom du meuble')).toHaveValue('Frigo 2');
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter le meuble' }));
    expect(api.createLocation).toHaveBeenCalledWith({
      name: 'Frigo 2',
      kind: 'fridge',
      shelfCount: 4,
    });
    expect(push).toHaveBeenCalledWith('/inventaire?nouveau=3');
  });

  it('deletes an empty piece of furniture after a confirmation that names it', async () => {
    const { api, user } = await setup();
    const frigo = screen.getByRole('region', { name: 'Lieu Frigo' });
    await user.click(within(frigo).getByRole('button', { name: 'Supprimer ce meuble' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer Frigo ?' });
    expect(dialog).toHaveAccessibleDescription('Il est vide : il disparaît avec ses étagères.');
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(api.deleteLocation).toHaveBeenCalledWith(2, undefined);
    expect(await screen.findByRole('status')).toHaveTextContent('Frigo supprimé.');
  });

  it('requires the destination of the products and says where they go', async () => {
    const full = locations.map((l) => (l.id === 2 ? { ...l, productCount: 12 } : l));
    const api = makeApi({ fetchLocations: vi.fn(async () => full) });
    const { user } = await setup(api);
    const frigo = screen.getByRole('region', { name: 'Lieu Frigo' });
    await user.click(within(frigo).getByRole('button', { name: 'Supprimer ce meuble' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer Frigo ?' });
    expect(dialog).toHaveAccessibleDescription(
      'Ses 12 produits seront rangés dans le plateau « Non rangé » du meuble choisi ci-dessous.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(
      within(dialog).getByText('Choisissez le meuble qui recevra les produits.'),
    ).toBeVisible();
    expect(api.deleteLocation).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Meuble qui reçoit les produits'), '1');
    expect(dialog).toHaveAccessibleDescription(
      'Ses 12 produits seront rangés dans le plateau « Non rangé » de Garde-manger.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(api.deleteLocation).toHaveBeenCalledWith(2, 1);
  });

  it('cancels with Échap and gives the focus back to the button', async () => {
    const { api, user } = await setup();
    const frigo = screen.getByRole('region', { name: 'Lieu Frigo' });
    const button = within(frigo).getByRole('button', { name: 'Supprimer ce meuble' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(button).toHaveFocus();
    expect(api.deleteLocation).not.toHaveBeenCalled();
  });
});
