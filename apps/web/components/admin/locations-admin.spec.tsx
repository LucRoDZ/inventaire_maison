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
  await screen.findByRole('listitem', { name: 'Meuble Garde-manger' });
  return { api, user: userEvent.setup() };
}

const row = (name: string) => screen.getByRole('listitem', { name: `Meuble ${name}` });

/** Opens the line of a piece of furniture and returns it. */
async function open(user: ReturnType<typeof userEvent.setup>, name: string) {
  const line = row(name);
  const button = within(line)
    .getAllByRole('button')
    .find((b) => b.hasAttribute('aria-expanded'))!;
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button);
  return line;
}

describe('LocationsAdmin', () => {
  it('shows one closed line per piece of furniture: icon, name, number of products', async () => {
    await setup();
    const line = row('Garde-manger');
    const button = within(line).getAllByRole('button')[0]!;
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('Garde-manger');
    expect(button).toHaveTextContent('Vide');
    expect(within(line).queryByLabelText('Nom du meuble')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Icône/ })).toBeNull();
  });

  it('opens one line at a time', async () => {
    const { user } = await setup();
    await open(user, 'Garde-manger');
    expect(within(row('Garde-manger')).getByLabelText('Nom du meuble')).toBeInTheDocument();
    await open(user, 'Frigo');
    expect(within(row('Frigo')).getByLabelText('Nom du meuble')).toBeInTheDocument();
    expect(within(row('Garde-manger')).queryByLabelText('Nom du meuble')).toBeNull();
    expect(
      screen.getAllByRole('button').filter((b) => b.getAttribute('aria-expanded') === 'true'),
    ).toHaveLength(1);
  });

  it('renames, changes the icon in a grid and saves both with one « Enregistrer »', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    const save = within(pantry).getByRole('button', { name: 'Enregistrer' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    const name = within(pantry).getByLabelText('Nom du meuble');
    await user.clear(name);
    await user.type(name, 'Placard');
    await user.click(within(pantry).getByRole('button', { name: /Changer l’icône/ }));
    const sheet = screen.getByRole('dialog', { name: 'Icône de Garde-manger' });
    await user.click(within(sheet).getByRole('radio', { name: 'Verre de vin' }));
    await user.click(within(sheet).getByRole('button', { name: 'Choisir cette icône' }));
    expect(api.updateLocation).not.toHaveBeenCalled();
    await user.click(save);
    expect(api.updateLocation).toHaveBeenCalledWith(1, { name: 'Placard', icon: 'wine' });
    expect(await screen.findByRole('status')).toHaveTextContent('Placard enregistré.');
  });

  it('refuses an empty name or one already taken, under the field', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    const name = within(pantry).getByLabelText('Nom du meuble');
    await user.clear(name);
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer' }));
    expect(within(pantry).getByRole('alert')).toHaveTextContent('Donnez un nom au meuble.');
    await user.type(name, 'frigo');
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer' }));
    expect(within(pantry).getByRole('alert')).toHaveTextContent('déjà ce nom');
    expect(api.updateLocation).not.toHaveBeenCalled();
  });

  it('moves a location down by renumbering only what changed', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    await user.click(within(pantry).getByRole('button', { name: 'Descendre Garde-manger' }));
    expect(api.updateLocation).toHaveBeenCalledWith(1, { sortOrder: 1 });
    expect(api.updateLocation).toHaveBeenCalledWith(2, { sortOrder: 0 });
  });

  it('shows the shelves as compact lines and saves their name and type with the form', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    const line = within(pantry).getByRole('listitem', { name: 'Haut' });
    const name = within(line).getByLabelText('Nom de Haut');
    await user.clear(name);
    await user.type(name, 'Tout en haut');
    await user.selectOptions(within(line).getByLabelText('Type de Haut'), 'rack');
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer' }));
    expect(api.updateShelf).toHaveBeenCalledWith(10, { name: 'Tout en haut', kind: 'rack' });
    expect(api.updateLocation).not.toHaveBeenCalled();
  });

  it('refuses a shelf without a name', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    await user.clear(within(pantry).getByLabelText('Nom de Haut'));
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('obligatoire');
    expect(api.updateShelf).not.toHaveBeenCalled();
  });

  it('adds a shelf named after the next number', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    await user.click(within(pantry).getByRole('button', { name: 'Ajouter une étagère' }));
    expect(api.createShelf).toHaveBeenCalledWith({
      locationId: 1,
      name: 'Étagère 3',
      kind: 'plain',
    });
  });

  it('moves a shelf up', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    await user.click(within(pantry).getByRole('button', { name: 'Monter Bas' }));
    await waitFor(() => expect(api.updateShelf).toHaveBeenCalledWith(11, { sortOrder: 0 }));
    expect(api.updateShelf).toHaveBeenCalledWith(10, { sortOrder: 1 });
  });

  it('asks for a confirmation that names Non rangé before deleting a shelf', async () => {
    const { api, user } = await setup();
    const pantry = await open(user, 'Garde-manger');
    await user.click(within(pantry).getByRole('button', { name: 'Supprimer Haut' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Supprimer Haut ?' });
    expect(dialog).toHaveAccessibleDescription(
      'Ses produits restent dans Garde-manger, sur le plateau « Non rangé ».',
    );
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(api.deleteShelf).not.toHaveBeenCalled();
    await user.click(within(pantry).getByRole('button', { name: 'Supprimer Haut' }));
    dialog = screen.getByRole('alertdialog', { name: 'Supprimer Haut ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer Haut' }));
    expect(api.deleteShelf).toHaveBeenCalledWith(10);
    expect(await screen.findByRole('status')).toHaveTextContent('plateau « Non rangé »');
  });

  it('shows the API message when an action fails', async () => {
    const api = makeApi({
      updateLocation: vi.fn(async () => {
        throw new ApiError(400, 'Meuble invalide');
      }),
    });
    const { user } = await setup(api);
    const pantry = await open(user, 'Garde-manger');
    await user.type(within(pantry).getByLabelText('Nom du meuble'), 'x');
    await user.click(within(pantry).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Meuble invalide');
  });

  it('moves a piece of furniture at once and puts it back when the server refuses', async () => {
    const api = makeApi({
      updateLocation: vi.fn(async () => {
        throw new ApiError(500, 'Erreur du serveur');
      }),
    });
    const { user } = await setup(api);
    const names = () =>
      screen
        .getAllByRole('listitem')
        .filter((l) => l.getAttribute('aria-label')?.startsWith('Meuble '))
        .map((r) => r.getAttribute('aria-label'));
    expect(names()).toEqual(['Meuble Garde-manger', 'Meuble Frigo']);
    const pantry = await open(user, 'Garde-manger');
    await user.click(within(pantry).getByRole('button', { name: 'Descendre Garde-manger' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur du serveur');
    expect(names()).toEqual(['Meuble Garde-manger', 'Meuble Frigo']);
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
    const frigo = await open(user, 'Frigo');
    await user.click(within(frigo).getByRole('button', { name: 'Supprimer ce meuble' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer Frigo ?' });
    expect(dialog).toHaveAccessibleDescription('Il est vide : il disparaît avec ses étagères.');
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer Frigo' }));
    expect(api.deleteLocation).toHaveBeenCalledWith(2, undefined);
    expect(await screen.findByRole('status')).toHaveTextContent('Meuble « Frigo » supprimé.');
  });

  it('requires the destination of the products and says where they go', async () => {
    const full = locations.map((l) => (l.id === 2 ? { ...l, productCount: 12 } : l));
    const api = makeApi({ fetchLocations: vi.fn(async () => full) });
    const { user } = await setup(api);
    const frigo = await open(user, 'Frigo');
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
    const frigo = await open(user, 'Frigo');
    const button = within(frigo).getByRole('button', { name: 'Supprimer ce meuble' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(button).toHaveFocus();
    expect(api.deleteLocation).not.toHaveBeenCalled();
  });
});
