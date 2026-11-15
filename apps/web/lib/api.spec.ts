import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';
import { RUNTIME_CACHES } from './cache-names';

const fetchMock = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { pathname: '/inventaire', assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiFetch', () => {
  it('returns the parsed body', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'ok' }));
    expect(await apiFetch('/health')).toEqual({ status: 'ok' });
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/auth/logout', { method: 'POST' })).toBeUndefined();
  });

  it('empties the caches, then sends the login page on 401', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    fetchMock.mockResolvedValue(json(401, { message: 'Authentification requise' }));
    await expect(apiFetch('/stock')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/connexion'));
    expect([...deleted].sort()).toEqual([...RUNTIME_CACHES].sort());
  });

  it('still sends the login page on 401 when the caches cannot be emptied', async () => {
    vi.stubGlobal('caches', { delete: () => Promise.reject(new Error('quota')) });
    fetchMock.mockResolvedValue(json(401, { message: 'x' }));
    await expect(apiFetch('/stock')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/connexion'));
  });

  it('does not redirect on 401 when asked not to', async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'x' }));
    await expect(apiFetch('/auth/login', { skipLoginRedirect: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('turns a network failure into status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(apiFetch('/stock')).rejects.toMatchObject({ status: 0 });
  });

  it('keeps the server message and the Retry-After delay', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Trop vite' }), {
        status: 429,
        headers: { 'Retry-After': '120' },
      }),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 429,
      message: 'Trop vite',
      retryAfter: 120,
    });
  });
});
