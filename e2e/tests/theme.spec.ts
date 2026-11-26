import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { furnitureSettled, signIn } from './helpers';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Gives the screens products with a close and a past date, so that the badges are audited too. */
async function seed(page: Page, tag: string, baseURL: string) {
  const headers = { Origin: baseURL };
  const name = `Produit du thème ${tag}`;
  const existing = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(name)}&limit=1`)
  ).json()) as { name: string }[];
  if (existing.some((p) => p.name === name)) return;
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
  }[];
  const places = (await (await page.request.get('/api/locations')).json()) as {
    id: number;
    name: string;
  }[];
  const place = places.find((l) => l.name === 'Garde-manger')!;
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  for (const [label, offset] of [
    [name, 2],
    [`${name} périmé`, -3],
  ] as const) {
    const created = await page.request.post('/api/products', {
      headers,
      data: { name: label, categoryId: categories[0]!.id, defaultLocationId: place.id },
    });
    const { id: productId } = (await created.json()) as { id: number };
    await page.request.post('/api/stock/adjust', {
      headers,
      data: {
        productId,
        locationId: place.id,
        delta: 2,
        reason: 'manual',
        expiryDate: day(offset),
      },
    });
  }
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([]);
}

async function heading(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
}

for (const viewport of VIEWPORTS) {
  test.describe(`thème à ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }, testInfo) => {
      await signIn(page);
      const tag = `${testInfo.project.name === 'webkit-mobile' ? 'B' : 'A'}${viewport.width}`;
      await seed(page, tag, testInfo.project.use.baseURL!);
    });

    for (const theme of THEMES) {
      test(`parcours en ${theme} : axe, contraste compris`, async ({ page }) => {
        await page.evaluate(
          (value) => window.localStorage.setItem('inventaire.theme', value),
          theme,
        );

        const check = async (path: string, label: string, after?: () => Promise<void>) => {
          await page.goto(path);
          await heading(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await after?.();
          await audit(page, `${theme} ${label}`);
        };

        await check('/inventaire', 'Inventaire, vue Maison');
        await check('/inventaire', 'Inventaire, vue Liste', async () => {
          await page.getByRole('button', { name: 'Liste', exact: true }).click();
          await page.waitForLoadState('networkidle');
        });
        const places = (await (await page.request.get('/api/locations')).json()) as {
          id: number;
        }[];
        await check(`/inventaire/${places[0]!.id}`, 'Meuble ouvert', () => furnitureSettled(page));
        await check('/scanner', 'Scanner');
        await check('/courses', 'Courses');
        await check('/plus/statistiques', 'Statistiques');
        await check('/plus/compte', 'Compte');
      });
    }

    test('le choix persiste et s’applique avant le premier rendu', async ({ page }) => {
      await page.goto('/plus/compte');
      await heading(page);
      await expect(page.getByRole('radio', { name: 'Automatique' })).toBeChecked();
      await page.getByRole('radio', { name: 'Sombre' }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
        'content',
        /^#/,
      );

      // On the next load, data-theme is already there when the body appears.
      await page.addInitScript(() => {
        const watch = new MutationObserver(() => {
          if (!document.body) return;
          (window as unknown as { __firstTheme: string | undefined }).__firstTheme =
            document.documentElement.dataset['theme'];
          watch.disconnect();
        });
        watch.observe(document, { childList: true, subtree: true });
      });
      await page.reload();
      await heading(page);
      expect(
        await page.evaluate(() => (window as unknown as { __firstTheme?: string }).__firstTheme),
      ).toBe('dark');
      await expect(page.getByRole('radio', { name: 'Sombre' })).toBeChecked();

      await page.getByRole('radio', { name: 'Clair' }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('Automatique suit le téléphone', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/plus/compte');
      await heading(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  });
}

test('thème : les deux palettes sont distinctes', async ({ page }) => {
  await signIn(page);
  const background = async (theme: Theme) => {
    await page.evaluate((value) => window.localStorage.setItem('inventaire.theme', value), theme);
    await page.goto('/plus/compte');
    await heading(page);
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  };
  expect(await background('dark')).not.toBe(await background('light'));
});
