import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
} from 'serwist';
import { applyBadge, badgeCount } from '../lib/badge';
import { PAGES_CACHE, RETIRED_CACHES } from '../lib/cache-names';
import { notificationFor, parsePushPayload, safePushUrl } from '../lib/push-payload';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_HTML = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventaire maison</title><body style="font-family:Carlito,Calibri,Arial,sans-serif;padding:24px"><h1>Pas de connexion</h1><p>Cette page n’a pas encore été ouverte sur cet appareil. Reconnectez-vous puis réessayez.</p></body></html>`;

const serwist = new Serwist({
  // JS, CSS, fonts and icons: precached at install and versioned by revision.
  precacheEntries: self.__SW_MANIFEST,
  // Silent update: a new version takes over at once, nobody is asked anything. The open pages
  // switch to it at their next navigation (see lib/silent-update.ts); the precache of the previous
  // version is removed.
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  // Only GET requests are matched: writes (POST, PATCH, DELETE) are never intercepted.
  runtimeCaching: [
    // The API is never cached by the service worker, pictures included: on a shared phone, a cache
    // keyed by address would show the data of one household to another (decision A.5). Pictures
    // are kept by the browser itself (`no-cache` + ETag: the server checks the household each time).
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    // Pages (the app shell): network first, so a visited page opens offline.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 30 })],
      }),
    },
  ],
});

// A page never visited and offline: fall back to the shell of the home page, else a short notice.
serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const shell = await caches.match('/', { cacheName: PAGES_CACHE });
    if (shell) return shell;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return Response.error();
});

// Caches of the versions that kept API reads and pictures: removed for good.
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(RETIRED_CACHES.map((name) => caches.delete(name))));
});

/** The count on the app icon, read from the API with the session cookie; cleared at 0. */
async function updateBadge(): Promise<void> {
  try {
    const response = await fetch('/api/stock/summary', { credentials: 'same-origin' });
    if (!response.ok) return;
    const summary = (await response.json()) as { today: number; soon: number; expired: number };
    await applyBadge(badgeCount(summary), self.navigator as never);
  } catch {
    // Offline or signed out: the badge stays as it was.
  }
}

// Daily summary: shown as a notification; a message that is not a summary shows nothing.
self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json();
  } catch {
    raw = null;
  }
  const payload = parsePushPayload(raw);
  if (!payload) return;
  const { title, options } = notificationFor(payload);
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), updateBadge()]));
});

// A tap opens the list filtered on the expiry: an open window of the app is reused.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    safePushUrl((event.notification.data as { url?: unknown } | null)?.url),
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(url).catch(() => undefined);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

serwist.addEventListeners();
