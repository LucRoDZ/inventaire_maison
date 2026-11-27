import { expect, test, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, signIn } from './helpers';

// The queue lives in IndexedDB and the shell comes from the service worker: Chromium only.
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium uniquement');

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';
const headers = { Origin: baseURL };
// Its own household and product: nothing it creates may show up in the other specs (shared database).
const BARCODE = '3760009898981';
const USER = 'offsync';
const PASSWORD = 'offline-sync-e2e-password';

async function signInOwnHousehold(page: Page) {
  await ensureAccountInOwnHousehold(baseURL, USER, PASSWORD, 'Foyer hors ligne');
  await signIn(page, USER, PASSWORD);
}

/** Reads the offline database of the page: queue length and whether a catalogue is stored. */
async function offlineState(page: Page) {
  // A page that is navigating has no execution context for a moment: answer null, the poll retries.
  return readOfflineState(page).catch(() => null);
}

async function readOfflineState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ ops: number; unknown: number; catalog: boolean; scope: boolean } | null>(
        (resolve) => {
          // Opening a missing database would create an empty one under the feet of the application.
          void indexedDB.databases().then((all) => {
            if (!all.some((d) => d.name === 'inventaire-sync')) return resolve(null);
            read();
          });
          const read = () => {
            const open = indexedDB.open('inventaire-sync');
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('ops')) return resolve(null);
              const tx = db.transaction(['ops', 'unknown', 'meta'], 'readonly');
              const ops = tx.objectStore('ops').count();
              const unknown = tx.objectStore('unknown').count();
              const catalog = tx.objectStore('meta').count('catalog');
              const scope = tx.objectStore('meta').count('scope');
              tx.oncomplete = () => {
                db.close();
                resolve({
                  ops: ops.result,
                  unknown: unknown.result,
                  catalog: catalog.result > 0,
                  scope: scope.result > 0,
                });
              };
            };
          };
        },
      ),
  );
}

async function createKnownProduct(page: Page): Promise<number> {
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
    isFallback: boolean;
  }[];
  const places = (await (await page.request.get('/api/locations')).json()) as {
    id: number;
    name: string;
  }[];
  const created = await page.request.post('/api/products', {
    headers,
    data: {
      name: 'Lentilles corail hors ligne',
      barcode: BARCODE,
      categoryId: categories.find((c) => !c.isFallback)!.id,
      defaultLocationId: places.find((p) => p.name === 'Frigo')!.id,
    },
  });
  expect(created.ok()).toBe(true);
  return ((await created.json()) as { id: number }).id;
}

async function stockOf(page: Page, productId: number): Promise<number> {
  const body = (await (await page.request.get('/api/stock?q=hors+ligne')).json()) as {
    items: { product: { id: number }; quantity: number }[];
  };
  return body.items
    .filter((i) => i.product.id === productId)
    .reduce((sum, i) => sum + i.quantity, 0);
}

test('hors ligne, un scan saisi à la main est gardé puis synchronisé au retour du réseau', async ({
  page,
  context,
}) => {
  await signInOwnHousehold(page);
  const productId = await createKnownProduct(page);
  await page.goto('/scanner');

  // The catalogue is downloaded when the app opens; the shell is cached by the service worker.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();
  await expect.poll(async () => (await offlineState(page))?.catalog).toBe(true);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Saisir un code' }).click();
  await page.getByLabel('Code-barres').fill(BARCODE);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Hors ligne : le scan est gardé sur cet appareil')).toBeVisible();
  expect((await offlineState(page))?.ops).toBe(1);

  // The badge is on the scanner itself (no bottom bar on the full-screen scanner).
  await expect(page.getByRole('link', { name: 'À synchroniser (1)' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('link', { name: /À synchroniser/ })).toHaveCount(0);
  await expect.poll(() => stockOf(page, productId)).toBe(1);
  // The server applies the operation before the device removes it from its queue.
  await expect.poll(async () => (await offlineState(page))?.ops).toBe(0);
});

test('la déconnexion vide la file et le cache de l’appareil', async ({ page, context }) => {
  await signInOwnHousehold(page);
  await createKnownProduct(page).catch(() => undefined);
  await page.goto('/scanner');
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();
  await expect.poll(async () => (await offlineState(page))?.catalog).toBe(true);

  // An unknown code stays in the queue « à identifier », even back online.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Saisir un code' }).click();
  await page.getByLabel('Code-barres').fill('3017620422003');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Hors ligne : le scan est gardé sur cet appareil')).toBeVisible();
  await context.setOffline(false);
  await expect
    .poll(() => offlineState(page))
    .toMatchObject({ unknown: 1, catalog: true, scope: true });

  await page.goto('/plus');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  expect(await offlineState(page)).toMatchObject({
    ops: 0,
    unknown: 0,
    catalog: false,
    scope: false,
  });
});
