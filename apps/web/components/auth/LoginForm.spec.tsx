import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function fill(username: string, password: string) {
  const user = userEvent.setup();
  if (username) await user.type(screen.getByLabelText('Pseudo'), username);
  if (password) await user.type(screen.getByLabelText('Mot de passe'), password);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LoginForm', () => {
  it('asks for both fields without calling the API', async () => {
    render(<LoginForm />);
    await fill('lucas', '');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saisissez votre pseudo et votre mot de passe',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the credentials and goes to the scanner on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, username: 'lucas', role: 'admin' }));
    render(<LoginForm />);
    await fill('lucas', 'motdepasse1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'lucas', password: 'motdepasse1' }),
      }),
    );
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows the 401 message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Pseudo ou mot de passe incorrect' }));
    render(<LoginForm />);
    await fill('lucas', 'faux');
    expect(await screen.findByRole('alert')).toHaveTextContent('Pseudo ou mot de passe incorrect');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows the 429 message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { message: 'x' }, { 'Retry-After': '600' }));
    render(<LoginForm />);
    await fill('lucas', 'faux');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trop de tentatives, réessayez dans 15 minutes',
    );
  });

  it('shows a network error message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LoginForm />);
    await fill('lucas', 'motdepasse1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur');
  });

  it('lets the user retry after an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'x' }));
    render(<LoginForm />);
    await fill('lucas', 'faux');
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
  });
});
