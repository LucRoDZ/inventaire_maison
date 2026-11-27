import { expect, test, type Locator, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, signIn } from './helpers';

const PASSWORD = 'phase-4-ui-e2e-password';
const DAIRY = 'Produits laitiers et œufs';

interface Place {
  id: number;
  name: string;
}
interface Category {
  id: number;
  name: string;
}

/** An account alone in its household, signed in, with small API helpers. */
async function setup(
  page: Page,
  testInfo: { project: { name: string; use: { baseURL?: string } } },
  label: string,
) {
  const baseURL = testInfo.project.use.baseURL!;
  const tag = testInfo.project.name === 'webkit-mobile' ? 'w' : 'c';
  const user = `p4ui${tag}${label}`;
  await ensureAccountInOwnHousehold(baseURL, user, PASSWORD, `Foyer ${user}`);
  await signIn(page, user, PASSWORD);
  const headers = { Origin: baseURL };
  const get = async <T>(path: string) => (await (await page.request.get(path)).json()) as T;
  const post = async <T>(path: string, data: unknown) => {
    const response = await page.request.post(path, { headers, data });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  };
  const places = await get<Place[]>('/api/locations');
  const categories = await get<Category[]>('/api/categories');
  const fridge = places.find((p) => p.name === 'Frigo')!;
  const dairy = categories.find((c) => c.name === DAIRY)!;
  return {
    stockProduct: async (name: string, quantity: number) => {
      const { id: productId } = await post<{ id: number }>('/api/products', {
        name,
        categoryId: dairy.id,
        defaultLocationId: fridge.id,
      });
      await post('/api/stock/adjust', {
        productId,
        locationId: fridge.id,
        delta: quantity,
        reason: 'manual',
      });
      return productId;
    },
    quantityOf: async (name: string) =>
      (
        await get<{ items: { quantity: number }[] }>(`/api/stock?q=${encodeURIComponent(name)}`)
      ).items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

/** A finger (or a mouse) pulled sideways across a row. */
async function pull(page: Page, row: Locator, dx: number) {
  const box = (await row.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

async function noPageScroll(page: Page) {
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}

test.describe('phase 4, interface', () => {
  // The service worker would answer the API itself: the mocked summary must be seen by the page.
  test.use({ serviceWorkers: 'block' });

  test('list: swipe right records « Consommé », swipe left « Jeté », both with undo', async ({
    page,
  }, testInfo) => {
    const app = await setup(page, testInfo, 'swipe');
    await app.stockProduct('Yaourt glissé', 3);
    await app.stockProduct('Flan glissé', 3);

    await page.goto('/inventaire?vue=liste');
    const yaourt = page.locator('[data-swipe-row]').filter({ hasText: 'Yaourt glissé' });
    const flan = page.locator('[data-swipe-row]').filter({ hasText: 'Flan glissé' });
    await expect(yaourt).toBeVisible();

    await pull(page, yaourt, 120);
    await expect(page.getByText(/Consommé : 1 × Yaourt glissé/)).toBeVisible();
    await expect.poll(() => app.quantityOf('Yaourt glissé')).toBe(2);
    await page.getByRole('button', { name: /Annuler/ }).click();
    await expect.poll(() => app.quantityOf('Yaourt glissé')).toBe(3);

    await pull(page, flan, -120);
    await expect(page.getByText(/Jeté : 1 × Flan glissé/)).toBeVisible();
    await expect.poll(() => app.quantityOf('Flan glissé')).toBe(2);
    await page.getByRole('button', { name: /Annuler/ }).click();
    await expect.poll(() => app.quantityOf('Flan glissé')).toBe(3);

    // The swipe layer is hidden from assistive technology.
    await expect(page.locator('[data-swipe-layer]').first()).toHaveAttribute('aria-hidden', 'true');
    await noPageScroll(page);
  });

  test('list: the buttons do the same without any swipe', async ({ page }, testInfo) => {
    const app = await setup(page, testInfo, 'keys');
    await app.stockProduct('Beurre clavier', 2);
    await page.goto('/inventaire?vue=liste');
    await page.getByRole('button', { name: 'Retirer une unité de Beurre clavier' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Consommé : 1 × Beurre clavier/)).toBeVisible();
    await page.getByRole('button', { name: 'Jeté', exact: true }).click();
    await expect(page.getByText(/Jeté : 1 × Beurre clavier/)).toBeVisible();
    await expect.poll(() => app.quantityOf('Beurre clavier')).toBe(1);
  });

  test('house view: no swipe row, a sideways drag changes nothing', async ({ page }, testInfo) => {
    const app = await setup(page, testInfo, 'house');
    await app.stockProduct('Lait maison', 2);
    await page.goto('/inventaire');
    await expect(page.getByRole('link', { name: /Frigo/ }).first()).toBeVisible();
    await expect(page.locator('[data-swipe-row]')).toHaveCount(0);
    await pull(page, page.getByRole('link', { name: /Frigo/ }).first(), -120);
    await expect(page.getByText(/Jeté|Consommé/)).toHaveCount(0);
    await expect.poll(() => app.quantityOf('Lait maison')).toBe(2);
  });

  test('courses: swipe right checks, swipe left deletes with undo; share falls back to the clipboard', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.push(text) },
        configurable: true,
      });
    });
    await setup(page, testInfo, 'shop');
    await page.goto('/courses');
    const field = page.getByLabel('Ajouter un article');
    await field.fill('Pommes');
    await page.getByRole('button', { name: 'Ajouter à la liste' }).click();
    // The field empties once the server has answered: only then is the next line typed.
    await expect(field).toHaveValue('');
    await field.fill('Farine');
    await page.getByRole('button', { name: 'Ajouter à la liste' }).click();
    const list = page.getByRole('list', { name: 'Articles à acheter' });
    const pommes = list.locator('[data-swipe-row]').filter({ hasText: 'Pommes' });
    await expect(pommes).toBeVisible();

    await pull(page, pommes, 120);
    await expect(pommes.getByRole('checkbox')).toBeChecked();

    const farine = list.locator('[data-swipe-row]').filter({ hasText: 'Farine' });
    await pull(page, farine, -120);
    await expect(page.getByText('Supprimé : Farine')).toBeVisible();
    await expect(farine).toHaveCount(0);
    await page.getByRole('button', { name: /Annuler/ }).click();
    await expect(list.locator('[data-swipe-row]').filter({ hasText: 'Farine' })).toBeVisible();

    await page.getByRole('button', { name: "Plus d'actions" }).click();
    await page.getByRole('menuitem', { name: 'Partager la liste' }).click();
    await expect(page.getByText('Liste copiée dans le presse-papiers.')).toBeVisible();
    const copied = await page.evaluate(
      () => (window as unknown as { __copied: string[] }).__copied,
    );
    expect(copied[0]).toContain('- Farine');
    expect(copied[0]).not.toContain('Pommes');
    await noPageScroll(page);
  });

  test('app badge: the number of expired and soon products, from a mocked API', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { __badge: string[] }).__badge = calls;
      Object.defineProperty(navigator, 'setAppBadge', {
        value: async (n?: number) => void calls.push(`set:${n}`),
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: async () => void calls.push('clear'),
        configurable: true,
      });
    });
    let summary = { inStock: 4, today: 1, soon: 2, expired: 1, expiryAlertDays: 3 };
    await page.route('**/api/stock/summary', (route) => route.fulfill({ json: summary }));
    await page.goto('/connexion');
    await signIn(page);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __badge: string[] }).__badge))
      .toContain('set:4');

    summary = { inStock: 4, today: 0, soon: 0, expired: 0, expiryAlertDays: 3 };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __badge: string[] }).__badge))
      .toContain('clear');
  });

  test('manifest: Scanner and Courses shortcuts', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      shortcuts: { name: string; url: string }[];
    };
    expect(manifest.shortcuts.map((s) => [s.name, s.url])).toEqual([
      ['Scanner', '/scanner'],
      ['Courses', '/courses'],
    ]);
  });
});
