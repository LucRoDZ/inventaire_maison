import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { pushCode, signIn, startScanner } from './helpers';

type CameraWindow = { __e2eCameraActive?: boolean; __e2eCameraError?: string };

// The tests of a browser share one product: they run one after the other.
test.describe.configure({ mode: 'serial' });

// Both browser projects share one database: each one has its own product.
const PRODUCTS = {
  'chromium-mobile': { body: '376040100001', name: 'Skyr plein écran' },
  'webkit-mobile': { body: '376040200001', name: 'Fromage frais plein écran' },
} as const;

const checkDigit = (body: string) => {
  const sum = [...body].reduce(
    (total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10;
};

/** A product of the catalogue with its usual place, found again by its code. */
async function knownProduct(page: Page, testInfo: TestInfo) {
  const { body, name } = PRODUCTS[testInfo.project.name as keyof typeof PRODUCTS];
  const code = `${body}${checkDigit(body)}`;
  const found = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(name)}`)
  ).json()) as {
    name: string;
  }[];
  // The search is fuzzy: only the exact name counts.
  if (!found.some((product) => product.name === name)) {
    const places = (await (await page.request.get('/api/locations')).json()) as {
      id: number;
      name: string;
    }[];
    const categories = (await (await page.request.get('/api/categories')).json()) as {
      id: number;
    }[];
    const baseURL = testInfo.project.use.baseURL!;
    const response = await page.request.post('/api/products', {
      headers: { Origin: baseURL },
      data: {
        name,
        barcode: code,
        categoryId: categories[0]!.id,
        defaultLocationId: places.find((place) => place.name === 'Frigo')!.id,
      },
    });
    expect(response.ok()).toBe(true);
  }
  return { code, name };
}

const quantity = async (page: Page, name: string) => {
  const stock = (await (
    await page.request.get(`/api/stock?q=${encodeURIComponent(name)}`)
  ).json()) as {
    items: { quantity: number }[];
  };
  return stock.items.reduce((sum, item) => sum + item.quantity, 0);
};

const cameraActive = (page: Page) =>
  page.evaluate(() => (window as unknown as CameraWindow).__e2eCameraActive);

test('le scanner occupe tout l’écran, sans barre du bas', async ({ page }) => {
  await signIn(page);
  await startScanner(page);
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Scanner' })).toBeAttached();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);

  const close = page.getByRole('button', { name: 'Fermer le scanner' });
  const box = (await close.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  // The camera is on and the manual entry is at the bottom of the screen.
  expect(await cameraActive(page)).toBe(true);
  await expect(page.getByLabel('Code-barres')).toBeVisible();
});

test('fermer le scanner revient à l’écran précédent et coupe la caméra', async ({ page }) => {
  await signIn(page);
  await page.goto('/inventaire');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('link', { name: 'Scanner' }).click();
  await startScanner(page);
  expect(await cameraActive(page)).toBe(true);

  await page.getByRole('button', { name: 'Fermer le scanner' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  expect(await cameraActive(page)).toBe(false);
});

test('la caméra se coupe quand l’onglet passe en arrière-plan', async ({ page }) => {
  await signIn(page);
  await startScanner(page);
  expect(await cameraActive(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => cameraActive(page)).toBe(false);
  await expect(page.getByRole('button', { name: 'Activer la caméra' })).toBeVisible();
});

test('saisie manuelle d’un code connu : fiche en bas, compteur, « Annuler le dernier »', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const { code, name } = await knownProduct(page, testInfo);
  await page.goto('/scanner');
  await startScanner(page);
  const before = await quantity(page, name);

  await page.getByLabel('Code-barres').fill(code);
  await page.getByLabel('Code-barres').press('Enter');
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  // Still the same page, the usual place is preselected.
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(sheet.getByLabel('Lieu')).toHaveValue(/\d+/);
  await expect(sheet.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => quantity(page, name)).toBe(before + 2);

  await expect(page.getByText('1 produit ajouté')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler le dernier' }).click();
  await expect.poll(() => quantity(page, name)).toBe(before);
  await expect(page.getByText(/produits? ajoutés?$/)).toHaveCount(0);
});

test('lecture d’un code : coche, annonce « Lu : » et fiche', async ({ page }, testInfo) => {
  await signIn(page);
  const { code, name } = await knownProduct(page, testInfo);
  await page.goto('/scanner');
  await startScanner(page);
  await pushCode(page, code);
  await expect(page.getByRole('dialog', { name })).toBeVisible();
  await expect(page.locator('[aria-live]', { hasText: `Lu : ${name}` })).toBeAttached();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('caméra refusée : aide pas à pas et saisie manuelle toujours là', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    (window as unknown as CameraWindow).__e2eCameraError = 'denied';
  });
  await signIn(page);
  const { code, name } = await knownProduct(page, testInfo);
  await page.goto('/scanner');

  const help = page.getByRole('alert').filter({ hasText: 'Accès à la caméra refusé' });
  await expect(help).toBeVisible();
  await expect(help).toContainText(/Autorisations|Réglages|barre d’adresse/);
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  expect(await cameraActive(page)).toBeFalsy();

  await page.getByLabel('Code-barres').fill(code);
  await page.getByLabel('Code-barres').press('Enter');
  await expect(page.getByRole('dialog', { name })).toBeVisible();
});
