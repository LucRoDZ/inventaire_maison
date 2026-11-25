import type { HouseholdDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as HouseholdsApi from '../../lib/households-api';

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/plus/administration/categories',
  useSearchParams: () => search,
}));
import { HouseholdScope } from './HouseholdScope';
import { HouseholdsAdmin } from './HouseholdsAdmin';

const households: HouseholdDto[] = [
  {
    id: 2,
    name: 'Dupont',
    createdAt: 'x',
    locationCount: 4,
    isOwn: false,
    members: [],
  },
  {
    id: 1,
    name: 'Famille',
    createdAt: 'x',
    locationCount: 6,
    isOwn: true,
    members: [
      { id: 1, username: 'lucas', role: 'admin', disabled: false },
      { id: 2, username: 'marie', role: 'member', disabled: true },
    ],
  },
];

function makeApi(over: Partial<typeof HouseholdsApi> = {}): typeof HouseholdsApi {
  return {
    fetchHouseholds: vi.fn(async () => households),
    createHousehold: vi.fn(async (name) => ({ id: 3, name })),
    renameHousehold: vi.fn(async (id, name) => ({ id, name })),
    deleteHousehold: vi.fn(async () => undefined),
    ...over,
  };
}

describe('HouseholdsAdmin', () => {
  it('lists each household with its accounts and its number of pieces of furniture', async () => {
    render(<HouseholdsAdmin api={makeApi()} />);
    const famille = await screen.findByRole('region', { name: 'Foyer Famille' });
    expect(famille).toHaveTextContent('6 meubles');
    const accounts = within(famille).getByRole('list', { name: 'Comptes de Famille' });
    expect(
      within(accounts)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['lucas · Administrateur', 'marie · Membre · Désactivé']);
    expect(screen.getByRole('region', { name: 'Foyer Dupont' })).toHaveTextContent('Aucun compte.');
  });

  it('creates a household', async () => {
    const api = makeApi();
    render(<HouseholdsAdmin api={api} />);
    await screen.findByRole('region', { name: 'Foyer Famille' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Créer le foyer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nom du foyer : 1 à 40 caractères.');
    await user.type(screen.getByLabelText('Nom du nouveau foyer'), ' Foyer Durand ');
    await user.click(screen.getByRole('button', { name: 'Créer le foyer' }));
    expect(api.createHousehold).toHaveBeenCalledWith('Foyer Durand');
    expect(await screen.findByRole('status')).toHaveTextContent('Foyer « Foyer Durand » créé');
  });

  it('renames a household', async () => {
    const api = makeApi();
    render(<HouseholdsAdmin api={api} />);
    const dupont = await screen.findByRole('region', { name: 'Foyer Dupont' });
    const user = userEvent.setup();
    const name = within(dupont).getByLabelText('Nom du foyer');
    await user.clear(name);
    await user.type(name, 'Durand');
    await user.click(within(dupont).getByRole('button', { name: 'Renommer le foyer' }));
    expect(api.renameHousehold).toHaveBeenCalledWith(2, 'Durand');
  });

  it('offers no deletion while a household has accounts, and says why', async () => {
    render(<HouseholdsAdmin api={makeApi()} />);
    const famille = await screen.findByRole('region', { name: 'Foyer Famille' });
    expect(within(famille).queryByRole('button', { name: 'Supprimer le foyer' })).toBeNull();
    expect(famille).toHaveTextContent('déplacez d’abord ses 2 comptes');
  });

  it('deletes an empty household only once its name is typed again', async () => {
    const api = makeApi();
    render(<HouseholdsAdmin api={api} />);
    const dupont = await screen.findByRole('region', { name: 'Foyer Dupont' });
    const user = userEvent.setup();
    await user.click(within(dupont).getByRole('button', { name: 'Supprimer le foyer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer le foyer Dupont ?' });
    expect(dialog).toHaveAccessibleDescription(
      /Seule une sauvegarde de la base permet de revenir en arrière/,
    );
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    const confirm = within(dialog).getByRole('button', { name: 'Supprimer Dupont' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Retapez « Dupont » pour confirmer'), 'dupont');
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Retapez « Dupont » pour confirmer'));
    await user.type(within(dialog).getByLabelText('Retapez « Dupont » pour confirmer'), 'Dupont');
    await user.click(confirm);
    expect(api.deleteHousehold).toHaveBeenCalledWith(2, 'Dupont');
    expect(await screen.findByRole('status')).toHaveTextContent('Foyer « Dupont » supprimé.');
  });
});

describe('HouseholdScope', () => {
  it('shows the household of the admin by default and keeps the choice in the address', async () => {
    search = new URLSearchParams();
    const user = userEvent.setup();
    render(
      <HouseholdScope load={async () => households}>
        {(household) => <p>Écran de {household.name}</p>}
      </HouseholdScope>,
    );
    expect(await screen.findByText('Écran de Famille')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Foyer concerné'), 'Dupont');
    expect(replace).toHaveBeenCalledWith('/plus/administration/categories?foyer=2');
  });

  it('opens the household of the address', async () => {
    search = new URLSearchParams('foyer=2');
    render(
      <HouseholdScope load={async () => households}>
        {(household) => <p>Écran de {household.name}</p>}
      </HouseholdScope>,
    );
    expect(await screen.findByText('Écran de Dupont')).toBeVisible();
  });
});
