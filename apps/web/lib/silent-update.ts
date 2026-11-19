/**
 * Silent update. A new service worker takes over by itself (skipWaiting, clientsClaim): this
 * module only remembers that the open page runs an older version, and swaps it for the new one
 * at a moment that interrupts nothing, the next navigation from one screen to another. Nothing
 * is ever shown and nobody is ever asked anything.
 */

/** What is going on that a reload must never cut: the camera of the scanner, a drag. */
export type BusyReason = 'camera' | 'drag';

const busy = new Set<BusyReason>();
let dirty = false;
let pending = false;

export function setBusy(reason: BusyReason, on: boolean): void {
  if (on) busy.add(reason);
  else busy.delete(reason);
}

/** Text typed and not saved on the current screen. Cleared at each navigation and on submit. */
export function markDirty(): void {
  dirty = true;
}

export function resetDirty(): void {
  dirty = false;
}

/** Camera on, drag in progress, unsaved text, or a sheet or panel open (any modal dialog). */
export function isBusy(doc: Document = document): boolean {
  return busy.size > 0 || dirty || doc.querySelector('[aria-modal="true"]') !== null;
}

/** A newer version controls the page: switch to it at the next navigation. */
export function markUpdatePending(): void {
  pending = true;
}

export function isUpdatePending(): boolean {
  return pending;
}

/**
 * After a navigation: reloads into the new version if one waits and nothing is going on.
 * Returns true when it reloaded.
 */
export function applyPendingUpdate(
  reload: () => void = () => window.location.reload(),
  doc: Document = document,
): boolean {
  if (!pending || isBusy(doc)) return false;
  pending = false;
  reload();
  return true;
}

/** Fields whose typing counts as unsaved text. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'range', 'hidden'].includes(
      target.type,
    );
  }
  return target instanceof HTMLElement && target.isContentEditable === true;
}

/** Session flag of the chunk guard: the time of the last reload it made. */
export const CHUNK_RELOAD_KEY = 'inventaire.chunk-reload';
/** Within this delay after a reload, the guard never reloads again: no loop. */
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;

/**
 * A page opened before a deployment asks for a JavaScript chunk that no longer exists.
 * Webpack calls it ChunkLoadError; browsers word a failed dynamic import their own way.
 */
export function isChunkLoadError(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return (
    typeof message === 'string' &&
    /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  );
}

/**
 * Reloads the page once, silently. A flag in sessionStorage keeps it from doing it again within
 * CHUNK_RELOAD_WINDOW_MS, so a chunk that is really missing never makes the page loop.
 */
export function reloadOnceAfterChunkError(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  now: number,
  reload: () => void = () => window.location.reload(),
): boolean {
  try {
    const last = Number(storage?.getItem(CHUNK_RELOAD_KEY));
    if (last && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    if (!storage) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // Storage blocked: without the flag there is no protection against a loop, so no reload.
    return false;
  }
  reload();
  return true;
}

/** Tests only. */
export function resetSilentUpdate(): void {
  busy.clear();
  dirty = false;
  pending = false;
}
