import type { AuthUser } from '@inventaire/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { PasswordForm } from '../account/PasswordForm';
import { PlusMenu } from './PlusMenu';

let user: AuthUser | null = null;
vi.mock('../auth/AuthProvider', () => ({ useCurrentUser: () => user }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe('PlusMenu', () => {
  it('hides Administration from a member', () => {
    user = { id: 2, username: 'marie', role: 'member', dataScope: 'scope-test' };
    render(<PlusMenu />);
    expect(screen.getByRole('link', { name: 'Compte' })).toHaveAttribute('href', '/plus/compte');
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });

  it('links to the scanner settings', () => {
    user = { id: 2, username: 'marie', role: 'member', dataScope: 'scope-test' };
    render(<PlusMenu />);
    expect(screen.getByRole('link', { name: 'Scanner' })).toHaveAttribute('href', '/plus/scanner');
  });

  it('shows Administration to the admin', () => {
    user = { id: 1, username: 'root', role: 'admin', dataScope: 'scope-test' };
    render(<PlusMenu />);
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute(
      'href',
      '/plus/administration',
    );
  });
});

describe('PasswordForm', () => {
  async function fill(current: string, next: string, confirmation = next) {
    const u = userEvent.setup();
    if (current) await u.type(screen.getByLabelText('Mot de passe actuel'), current);
    if (next) await u.type(screen.getByLabelText('Nouveau mot de passe'), next);
    if (confirmation)
      await u.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirmation);
    await u.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
  }

  it('asks for the fields, the length and a matching confirmation without calling the API', async () => {
    const change = vi.fn();
    render(<PasswordForm change={change} />);
    await fill('', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez');
    await fill('ancien-mdp', 'court');
    expect(screen.getByRole('alert')).toHaveTextContent('de 8 à 128 caractères');
    expect(change).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that differs', async () => {
    const change = vi.fn();
    render(<PasswordForm change={change} />);
    await fill('ancien-mdp', 'nouveau-mdp-1', 'nouveau-mdp-2');
    expect(screen.getByRole('alert')).toHaveTextContent('La confirmation ne correspond pas');
    expect(change).not.toHaveBeenCalled();
  });

  it('sends both passwords and confirms', async () => {
    const change = vi.fn().mockResolvedValue(undefined);
    render(<PasswordForm change={change} />);
    await fill('ancien-mdp', 'nouveau-mdp-1');
    expect(change).toHaveBeenCalledWith('ancien-mdp', 'nouveau-mdp-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Mot de passe modifié');
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('');
  });

  it.each([
    [403, 'Le mot de passe actuel est incorrect'],
    [429, 'Trop de tentatives'],
    [0, 'Impossible de joindre le serveur'],
  ])('explains a %s answer', async (status, text) => {
    const change = vi.fn().mockRejectedValue(new ApiError(status, 'x'));
    render(<PasswordForm change={change} />);
    await fill('ancien-mdp', 'nouveau-mdp-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });
});
