import type { AuthUser } from '@inventaire/shared';
import { ApiError, apiFetch } from './api';
import { clearAppCaches } from './clear-caches';

/**
 * Signs in. The caches of the device are emptied first: another account, maybe of another
 * household, may have used it before (decision A.5).
 */
export async function login(username: string, password: string): Promise<AuthUser> {
  const user = await apiFetch<AuthUser>('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipLoginRedirect: true,
  });
  await clearAppCaches().catch(() => undefined);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    // Private data must not stay on the device, even when the call fails (offline, expired session).
    await clearAppCaches();
  }
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

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch('/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

/** French message for a failed password change. */
export function passwordErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Le mot de passe actuel est incorrect';
    if (error.status === 429) return 'Trop de tentatives, réessayez dans 15 minutes';
    if (error.status === 400) return 'Le nouveau mot de passe doit faire de 8 à 128 caractères';
    if (error.status === 0) return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
  }
  return 'Une erreur est survenue. Réessayez.';
}
