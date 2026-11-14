import { RUNTIME_CACHES } from './cache-names';

/** Empties the runtime caches (pages, API reads, product images). Called on logout. */
export async function clearAppCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await Promise.all(RUNTIME_CACHES.map((name) => caches.delete(name)));
}
