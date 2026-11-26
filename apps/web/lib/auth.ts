import type { AuthUser } from '@inventaire/shared';
import { ApiError, apiFetch } from './api';
import { applyBadge } from './badge';
import { clearAppCaches } from './clear-caches';
import { bindDataScope, purgeOfflineData } from './offline/runtime';
import { dropForeignSubscription, unsubscribeThisDevice } from './push';

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
  // Another data scope than the last one on this device: its queue and catalogue are deleted.
  await bindDataScope(user.dataScope).catch(() => undefined);
  await dropForeignSubscription(user.dataScope).catch(() => undefined);
  return user;
}

export async function logout(): Promise<void> {
  // This device stops receiving the household's notifications (needs the session: before the call).
  await unsubscribeThisDevice().catch(() => undefined);
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    // Private data must not stay on the device, even when the call fails (offline, expired session):
    // each step runs even if another one fails.
    await clearAppCaches().catch(() => undefined);
    await purgeOfflineData().catch(() => undefined);
    // The icon must not keep the count of the household that just signed out.
    await applyBadge(0).catch(() => undefined);
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
