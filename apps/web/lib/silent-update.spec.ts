import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPendingUpdate,
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isBusy,
  isChunkLoadError,
  isTextEntry,
  markDirty,
  markUpdatePending,
  reloadOnceAfterChunkError,
  resetDirty,
  resetSilentUpdate,
  setBusy,
} from './silent-update';

afterEach(() => {
  resetSilentUpdate();
  document.body.innerHTML = '';
});

describe('busy state', () => {
  it('is idle by default', () => {
    expect(isBusy()).toBe(false);
  });

  it('is busy while the camera is on or a drag is going on', () => {
    setBusy('camera', true);
    expect(isBusy()).toBe(true);
    setBusy('camera', false);
    setBusy('drag', true);
    expect(isBusy()).toBe(true);
    setBusy('drag', false);
    expect(isBusy()).toBe(false);
  });

  it('is busy with unsaved text until it is reset', () => {
    markDirty();
    expect(isBusy()).toBe(true);
    resetDirty();
    expect(isBusy()).toBe(false);
  });

  it('is busy while a modal sheet or panel is open', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(isBusy()).toBe(true);
  });

  it('counts typing in text fields, not ticking a box', () => {
    const text = document.createElement('input');
    const search = Object.assign(document.createElement('input'), { type: 'search' });
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(isTextEntry(text)).toBe(true);
    expect(isTextEntry(search)).toBe(true);
    expect(isTextEntry(document.createElement('textarea'))).toBe(true);
    expect(isTextEntry(box)).toBe(false);
    expect(isTextEntry(document.createElement('button'))).toBe(false);
  });
});

describe('applyPendingUpdate', () => {
  it('does nothing without a new version', () => {
    const reload = vi.fn();
    expect(applyPendingUpdate(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a new version waits and nothing is going on', () => {
    const reload = vi.fn();
    markUpdatePending();
    expect(applyPendingUpdate(reload)).toBe(true);
    expect(applyPendingUpdate(reload)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps the new version for later while busy', () => {
    const reload = vi.fn();
    markUpdatePending();
    setBusy('camera', true);
    expect(applyPendingUpdate(reload)).toBe(false);
    setBusy('camera', false);
    expect(applyPendingUpdate(reload)).toBe(true);
  });
});

describe('chunk guard', () => {
  it('recognises the errors of a missing chunk, in each browser', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'x' })).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 742 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk app-layout failed'))).toBe(true);
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /x.js')),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('x is undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Loading chunk 1 failed')).toBe(false);
  });

  it('reloads once and writes the flag', () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    };
    const reload = vi.fn();
    expect(reloadOnceAfterChunkError(store, 1_000_000, reload)).toBe(true);
    expect(storage.get(CHUNK_RELOAD_KEY)).toBe('1000000');
    // Right after: never again (no loop).
    expect(reloadOnceAfterChunkError(store, 1_000_000 + 10_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    // Much later (another deployment), allowed once more.
    expect(reloadOnceAfterChunkError(store, 1_000_000 + CHUNK_RELOAD_WINDOW_MS + 1, reload)).toBe(
      true,
    );
  });

  it('does not reload without a usable storage (no protection against a loop)', () => {
    const reload = vi.fn();
    expect(reloadOnceAfterChunkError(null, 1, reload)).toBe(false);
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(reloadOnceAfterChunkError(blocked, 1, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
