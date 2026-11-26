import type { AuthUser, UserDto } from '@inventaire/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type * as UsersApi from '../../lib/users-api';
import { AdminGate } from './AdminGate';
import { MembersAdmin } from './MembersAdmin';

let current: AuthUser | null = null;
vi.mock('../auth/AuthProvider', () => ({ useCurrentUser: () => current }));

const famille = { id: 1, name: 'Famille' };
const root: UserDto = {
  id: 1,
  username: 'root',
  role: 'admin',
  disabled: false,
  createdAt: 'x',
  household: famille,
};
const marie: UserDto = {
  id: 2,
  username: 'marie',
  role: 'member',
  disabled: false,
  createdAt: 'x',
  household: famille,
};
const paul: UserDto = {
  id: 3,
  username: 'paul',
  role: 'member',
  disabled: true,
  createdAt: 'x',
  household: famille,
};

const loadHouseholds = async () => [famille, { id: 2, name: 'Dupont' }];

function makeApi(over: Partial<typeof UsersApi> = {}): typeof UsersApi {
  return {
    fetchUsers: vi.fn(async () => [root, marie, paul]),
    moveUser: vi.fn(async (id, householdId) => ({
      ...marie,
      id,
      household: { id: householdId, name: 'Dupont' },
    })),
    createUser: vi.fn(async (input) => ({ ...marie, id: 9, ...input, disabled: false })),
    resetUserPassword: vi.fn(async () => marie),
    reactivateUser: vi.fn(async () => ({ ...paul, disabled: false })),
    deactivateUser: vi.fn(async () => undefined),
    ...over,
  };
}

beforeEach(() => {
  current = null;
});

describe('AdminGate', () => {
  it('waits while the session is checked, refuses a member, accepts the admin', () => {
    const { rerender } = render(<AdminGate>secret</AdminGate>);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    current = { id: 2, username: 'marie', role: 'member', dataScope: 'scope-test' };
    rerender(<AdminGate>secret</AdminGate>);
    expect(screen.getByRole('alert')).toHaveTextContent('Accès réservé à l’administrateur');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    current = { id: 1, username: 'root', role: 'admin', dataScope: 'scope-test' };
    rerender(<AdminGate>secret</AdminGate>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});

describe('MembersAdmin', () => {
  it('lists roles and states and offers no destructive action on oneself', async () => {
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={makeApi()} />);
    const self = await screen.findByRole('listitem', { name: 'root' });
    expect(self).toHaveTextContent('Administrateur · Actif');
    expect(within(self).queryByRole('button', { name: 'Désactiver' })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'paul' })).toHaveTextContent('Membre · Désactivé');
  });

  it('creates a member with a temporary password', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'Sophie');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'temporaire1');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    // The household is mandatory.
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez le foyer du compte');
    expect(api.createUser).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Foyer'), 'Famille');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(api.createUser).toHaveBeenCalledWith({
      username: 'sophie',
      password: 'temporaire1',
      role: 'member',
      householdId: 1,
    });
    expect(await screen.findByRole('listitem', { name: 'sophie' })).toBeInTheDocument();
  });

  it('validates the pseudo and the password before calling the API', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'a b');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pseudo de 3 à 30 caractères');
    await user.clear(screen.getByLabelText('Pseudo du nouveau membre'));
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'sophie');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'court');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(screen.getByRole('alert')).toHaveTextContent('de 8 à 128 caractères');
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('explains a 409 from the API', async () => {
    const api = makeApi({
      createUser: vi.fn().mockRejectedValue(new ApiError(409, 'Ce pseudo existe déjà.')),
    });
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'marie');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'temporaire1');
    await user.selectOptions(screen.getByLabelText('Foyer'), 'Dupont');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce pseudo existe déjà.');
  });

  it('asks for a confirmation before deactivating', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    const row = await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Désactiver' }));
    expect(api.deactivateUser).not.toHaveBeenCalled();
    await user.click(within(row).getByRole('button', { name: 'Annuler' }));
    expect(within(row).getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Désactiver' }));
    await user.click(within(row).getByRole('button', { name: 'Confirmer la désactivation' }));
    expect(api.deactivateUser).toHaveBeenCalledWith(2);
    expect(await within(row).findByText(/Membre · Désactivé/)).toBeInTheDocument();
  });

  it('reactivates a disabled member', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    const row = await screen.findByRole('listitem', { name: 'paul' });
    await userEvent.click(within(row).getByRole('button', { name: 'Réactiver' }));
    expect(api.reactivateUser).toHaveBeenCalledWith(3);
    expect(await within(row).findByText(/Membre · Actif/)).toBeInTheDocument();
  });

  it('resets a password after checking its length', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    const row = await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Nouveau mot de passe' }));
    await user.type(within(row).getByLabelText(/Nouveau mot de passe temporaire/), 'court');
    await user.click(within(row).getByRole('button', { name: 'Enregistrer le mot de passe' }));
    expect(within(row).getByRole('alert')).toHaveTextContent('de 8 à 128 caractères');
    await user.type(within(row).getByLabelText(/Nouveau mot de passe temporaire/), '-plus-long');
    await user.click(within(row).getByRole('button', { name: 'Enregistrer le mot de passe' }));
    expect(api.resetUserPassword).toHaveBeenCalledWith(2, 'court-plus-long');
    expect(await within(row).findByRole('status')).toHaveTextContent('sessions coupées');
  });

  it('shows the household of each account', async () => {
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={makeApi()} />);
    const row = await screen.findByRole('listitem', { name: 'marie' });
    expect(row).toHaveTextContent('Foyer : Famille');
  });

  it('creates an account in a new household named on the spot', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'durand');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'temporaire1');
    await user.selectOptions(screen.getByLabelText('Foyer'), 'Nouveau foyer…');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nom du nouveau foyer');
    await user.type(screen.getByLabelText('Nom du nouveau foyer'), ' Foyer Durand ');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(api.createUser).toHaveBeenCalledWith({
      username: 'durand',
      password: 'temporaire1',
      role: 'member',
      newHouseholdName: 'Foyer Durand',
    });
  });

  it('moves an account to another household after saying what it changes', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={api} />);
    const row = await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Changer de foyer' }));
    const move = within(row).getByRole('button', { name: 'Déplacer marie' });
    expect(move).toBeDisabled();
    await user.selectOptions(within(row).getByLabelText('Nouveau foyer de marie'), 'Dupont');
    expect(row).toHaveTextContent(
      'marie verra alors l’inventaire de Dupont et non plus celui de Famille. Ses sessions ouvertes seront coupées.',
    );
    await user.click(move);
    expect(api.moveUser).toHaveBeenCalledWith(2, 2);
    expect(await within(row).findByText('Foyer : Dupont')).toBeInTheDocument();
  });

  it('never offers to move oneself', async () => {
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={makeApi()} />);
    const self = await screen.findByRole('listitem', { name: 'root' });
    expect(within(self).queryByRole('button', { name: 'Changer de foyer' })).toBeNull();
  });

  it('moves the focus into the panel it opens, and back to the actions when it closes', async () => {
    render(<MembersAdmin currentUserId={1} loadHouseholds={loadHouseholds} api={makeApi()} />);
    const row = await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.click(within(row).getByRole('button', { name: 'Changer de foyer' }));
    expect(within(row).getByLabelText('Nouveau foyer de marie')).toHaveFocus();
    await user.click(within(row).getByRole('button', { name: 'Annuler' }));
    expect(within(row).getByRole('button', { name: 'Changer de foyer' })).toHaveFocus();
    await user.click(within(row).getByRole('button', { name: 'Désactiver' }));
    expect(within(row).getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });
});
