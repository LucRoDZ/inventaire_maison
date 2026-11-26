import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, pushCode, signIn, startScanner } from './helpers';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;

const PASSWORD = 'phase-3-e2e-password';
const DAIRY = 'Produits laitiers et œufs';

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}
interface Category {
  id: number;
  name: string;
  isFallback: boolean;
}

/** EAN-13 with a valid check digit, from 12 digits. */
function ean13(twelve: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));

/** An account alone in its household (no clash between parallel tests), signed in, with API helpers. */
async function setup(
  page: Page,
  testInfo: { project: { name: string; use: { baseURL?: string } } },
  width: number,
) {
  const baseURL = testInfo.project.use.baseURL!;
  const tag = testInfo.project.name === 'webkit-mobile' ? 'w' : 'c';
  const user = `p3${tag}${width}`;
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
  return {
    tag,
    place: (name: string) => places.find((p) => p.name === name)!,
    category: (name: string) => categories.find((c) => c.name === name)!,
    product: (data: Record<string, unknown>) => post<{ id: number }>('/api/products', data),
    stock: (data: Record<string, unknown>) =>
      post('/api/stock/adjust', { delta: 1, reason: 'manual', ...data }),
    items: async (q: string) =>
      (
        await get<{ items: { quantity: number; location: { name: string } }[] }>(
          `/api/stock?q=${encodeURIComponent(q)}`,
        )
      ).items,
  };
}

async function noPageScroll(page: Page) {
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}

async function axeClean(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (context ? builder.include(context) : builder).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`phase 3, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('courses : saisie rapide, cocher, ranger les articles cochés', async ({
      page,
    }, testInfo) => {
      const app = await setup(page, testInfo, viewport.width);
      await app.product({
        name: 'Tagliatelle fraîches',
        categoryId: app.category(DAIRY).id,
        defaultLocationId: app.place('Garde-manger').id,
      });

      await page.goto('/courses');
      const field = page.getByLabel('Ajouter un article');
      await expect(field).toBeVisible();
      const list = page.getByRole('list', { name: 'Articles à acheter' });
      const add = page.getByRole('button', { name: 'Ajouter à la liste' });

      await field.fill('2 x lait');
      await add.click();
      await expect(list.getByRole('listitem').filter({ hasText: 'lait' })).toContainText('2');
      await field.fill('500 g de farine');
      await add.click();
      await expect(list.getByRole('listitem').filter({ hasText: 'farine' })).toContainText('500 g');

      // A catalogue product is only added when its suggestion is tapped.
      await field.fill('Tagliatelle');
      await page
        .getByRole('group', { name: 'Produits du catalogue' })
        .getByRole('button', { name: 'Tagliatelle fraîches' })
        .click();
      const line = list.getByRole('listitem').filter({ hasText: 'Tagliatelle fraîches' });
      await expect(line).toBeVisible();
      await expect(list.getByRole('listitem')).toHaveCount(3);

      await axeClean(page);
      await noPageScroll(page);

      await line.getByRole('checkbox').check();
      await page.getByRole('button', { name: /^Ranger les articles cochés/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'article rangé' })).toBeVisible();
      await expect(line).toHaveCount(0);
      await expect(list.getByRole('listitem')).toHaveCount(2);
      await expect
        .poll(async () => (await app.items('Tagliatelle'))[0]?.location.name)
        .toBe('Garde-manger');
    });

    test('compteur « Bientôt » : filtre la vue Liste de l’inventaire', async ({
      page,
    }, testInfo) => {
      const app = await setup(page, testInfo, viewport.width);
      const pantry = app.place('Garde-manger');
      for (const [name, expiryDate] of [
        ['Crème bientôt périmée', inDays(2)],
        ['Riz lointain', inDays(60)],
      ] as const) {
        const { id: productId } = await app.product({
          name,
          categoryId: app.category(DAIRY).id,
          defaultLocationId: pantry.id,
        });
        await app.stock({ productId, locationId: pantry.id, expiryDate });
      }

      await page.goto('/inventaire');
      await page.getByRole('button', { name: 'Liste', exact: true }).click();
      await expect(page.getByText('Riz lointain').first()).toBeVisible();
      await expect(page.getByText('Crème bientôt périmée').first()).toBeVisible();

      const counters = page.getByRole('region', { name: 'Résumé du stock' });
      await axeClean(page);
      await counters.getByRole('button', { name: /Bientôt/ }).click();
      await expect(page).toHaveURL(/echeance=bientot/);
      await expect(counters.getByRole('button', { name: /Bientôt/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByText('Riz lointain')).toHaveCount(0);
      await expect(page.getByText('Crème bientôt périmée').first()).toBeVisible();
      await axeClean(page);
    });

    test('retrait « Jeté » puis Plus › Statistiques', async ({ page }, testInfo) => {
      const app = await setup(page, testInfo, viewport.width);
      const fridge = app.place('Frigo');
      const name = 'Flan à jeter';
      const { id: productId } = await app.product({
        name,
        categoryId: app.category(DAIRY).id,
        defaultLocationId: fridge.id,
      });
      await app.stock({
        productId,
        locationId: fridge.id,
        shelfId: fridge.shelves[0]!.id,
        delta: 2,
      });

      await page.goto(`/inventaire/${fridge.id}`);
      await page.getByRole('button', { name: new RegExp(`^${name}, quantité 2`) }).click();
      const sheet = page.getByRole('dialog', { name });
      await axeClean(page, '[role="dialog"]');
      await sheet.getByRole('button', { name: /^Jeté/ }).click();
      await expect(sheet.getByLabel('Quantité en stock')).toHaveText('1');
      await expect.poll(async () => (await app.items(name))[0]?.quantity).toBe(1);

      await page.goto('/plus');
      await page.getByRole('link', { name: 'Statistiques' }).click();
      await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible();
      const wasted = page
        .locator('dt', { hasText: /^Jeté$/ })
        .locator('xpath=following-sibling::dd[1]');
      await expect(wasted).toHaveText('1');
      await expect(page.getByRole('table').getByRole('rowheader', { name })).toBeVisible();
      await axeClean(page);
      await noPageScroll(page);
    });

    test('scan en rafale d’un produit connu, puis Annuler', async ({ page }, testInfo) => {
      const app = await setup(page, testInfo, viewport.width);
      const name = 'Skyr rafale';
      const code = ean13(`3760${app.tag === 'w' ? '2' : '1'}0${viewport.width}000`);
      await app.product({
        name,
        barcode: code,
        categoryId: app.category(DAIRY).id,
        defaultLocationId: app.place('Frigo').id,
      });

      await startScanner(page);
      await page.getByRole('checkbox', { name: 'Scan en rafale' }).check();
      await pushCode(page, code);
      const toast = page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` });
      await expect(toast).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(async () => (await app.items(name))[0]?.quantity).toBe(1);

      await axeClean(page);
      await toast.getByRole('button', { name: 'Annuler' }).click();
      await expect.poll(async () => (await app.items(name)).length).toBe(0);
    });

    test('fiche d’ajout : date limite « Suggérée » selon la catégorie', async ({
      page,
    }, testInfo) => {
      const app = await setup(page, testInfo, viewport.width);
      const name = 'Fromage blanc suggéré';
      const code = ean13(`3760${app.tag === 'w' ? '2' : '1'}1${viewport.width}000`);
      await app.product({
        name,
        barcode: code,
        categoryId: app.category(DAIRY).id,
        defaultLocationId: app.place('Frigo').id,
      });

      await startScanner(page);
      await pushCode(page, code);
      const sheet = page.getByRole('dialog', { name });
      await expect(sheet.getByText('Suggérée')).toBeVisible();
      await expect(sheet).toContainText('7 jours après l’achat');
      await expect(sheet.getByLabel('Date limite (facultative)')).toHaveValue(inDays(7));
      await axeClean(page, '[role="dialog"]');
    });

    test('navigation à quatre onglets, sans défilement de page', async ({ page }, testInfo) => {
      await setup(page, testInfo, viewport.width);
      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      await expect(nav.getByRole('link')).toHaveText(['Scanner', 'Inventaire', 'Courses', 'Plus']);

      await nav.getByRole('link', { name: 'Courses' }).click();
      await expect(page.getByRole('heading', { name: 'Courses', level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await noPageScroll(page);

      await nav.getByRole('link', { name: 'Plus' }).click();
      await page.getByRole('link', { name: 'Statistiques' }).click();
      await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await noPageScroll(page);

      await page.goto('/inventaire');
      await expect(nav.getByRole('link', { name: 'Inventaire' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await nav.getByRole('link', { name: 'Scanner' }).click();
      await expect(page.getByRole('heading', { name: 'Scanner', level: 1 })).toBeVisible();
    });
  });
}
