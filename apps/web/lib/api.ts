import { clearAppCaches } from './clear-caches';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    message: string,
    /** Seconds, from the Retry-After header of a 429. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const LOGIN_PATH = '/connexion';

/** The session is gone: empty the caches (private data), then go to the login page. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === LOGIN_PATH) return;
  void clearAppCaches()
    .catch(() => undefined)
    .finally(() => window.location.assign(LOGIN_PATH));
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Do not send the user back to the login page on 401 (used by the login form itself). */
  skipLoginRedirect?: boolean;
}

/** Same-origin call to the API. Throws ApiError; a 401 sends the user back to the login page. */
export async function apiFetch<T = void>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, skipLoginRedirect, headers, ...init } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur');
  }

  if (!response.ok) {
    if (response.status === 401 && !skipLoginRedirect) redirectToLogin();
    const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof payload?.message === 'string' ? payload.message : 'Erreur du serveur';
    const retryAfter = Number(response.headers.get('Retry-After'));
    throw new ApiError(
      response.status,
      message,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
