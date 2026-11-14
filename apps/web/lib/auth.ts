import type { AuthUser } from '@inventaire/shared';
import { ApiError, apiFetch } from './api';

export function login(username: string, password: string): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipLoginRedirect: true,
  });
}

export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

/** French message for a failed login. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Pseudo ou mot de passe incorrect';
    if (error.status === 429) return 'Trop de tentatives, réessayez dans 15 minutes';
    if (error.status === 0) return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
  }
  return 'Une erreur est survenue. Réessayez.';
}
