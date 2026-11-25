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

function makeApi(over: Partial<typeof UsersApi> = {}): typeof UsersApi {
  return {
    fetchUsers: vi.fn(async () => [root, marie, paul]),
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
    current = { id: 2, username: 'marie', role: 'member' };
    rerender(<AdminGate>secret</AdminGate>);
    expect(screen.getByRole('alert')).toHaveTextContent('Accès réservé à l’administrateur');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    current = { id: 1, username: 'root', role: 'admin' };
    rerender(<AdminGate>secret</AdminGate>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});

describe('MembersAdmin', () => {
  it('lists roles and states and offers no destructive action on oneself', async () => {
    render(<MembersAdmin currentUserId={1} api={makeApi()} />);
    const self = await screen.findByRole('listitem', { name: 'root' });
    expect(self).toHaveTextContent('Administrateur · Actif');
    expect(within(self).queryByRole('button', { name: 'Désactiver' })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'paul' })).toHaveTextContent('Membre · Désactivé');
  });

  it('creates a member with a temporary password', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'Sophie');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'temporaire1');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(api.createUser).toHaveBeenCalledWith({
      username: 'sophie',
      password: 'temporaire1',
      role: 'member',
    });
    expect(await screen.findByRole('listitem', { name: 'sophie' })).toBeInTheDocument();
  });

  it('validates the pseudo and the password before calling the API', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} api={api} />);
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
    render(<MembersAdmin currentUserId={1} api={api} />);
    await screen.findByRole('listitem', { name: 'marie' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Pseudo du nouveau membre'), 'marie');
    await user.type(screen.getByLabelText('Mot de passe temporaire'), 'temporaire1');
    await user.click(screen.getByRole('button', { name: 'Créer le membre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce pseudo existe déjà.');
  });

  it('asks for a confirmation before deactivating', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} api={api} />);
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
    render(<MembersAdmin currentUserId={1} api={api} />);
    const row = await screen.findByRole('listitem', { name: 'paul' });
    await userEvent.click(within(row).getByRole('button', { name: 'Réactiver' }));
    expect(api.reactivateUser).toHaveBeenCalledWith(3);
    expect(await within(row).findByText(/Membre · Actif/)).toBeInTheDocument();
  });

  it('resets a password after checking its length', async () => {
    const api = makeApi();
    render(<MembersAdmin currentUserId={1} api={api} />);
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
});
