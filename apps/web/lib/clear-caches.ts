import { RUNTIME_CACHES } from './cache-names';
import { forgetHome } from './home-api';

/** Empties the runtime caches (pages, API reads, product images) and the house kept in memory. Called on sign-in and logout. */
export async function clearAppCaches(): Promise<void> {
  forgetHome();
  if (typeof caches === 'undefined') return;
  await Promise.all(RUNTIME_CACHES.map((name) => caches.delete(name)));
}
