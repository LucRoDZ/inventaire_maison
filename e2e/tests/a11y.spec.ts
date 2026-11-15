import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// One narrow phone for every screen.
test.use({ viewport: { width: 360, height: 740 } });

interface Screen {
  name: string;
  path: string | ((page: Page) => Promise<string>);
  /** Opens the Liste view of the inventory. */
  list?: boolean;
}

async function firstProductPath(page: Page): Promise<string> {
  const found = (await (await page.request.get('/api/products?limit=1')).json()) as {
    id: number;
  }[];
  return found[0] ? `/produits/${found[0].id}` : '/produits/99999999';
}

async function firstLocationPath(page: Page): Promise<string> {
  const places = (await (await page.request.get('/api/locations')).json()) as { id: number }[];
  return `/inventaire/${places[0]!.id}`;
}

const SCREENS: Screen[] = [
  { name: 'Scanner', path: '/' },
  { name: 'Inventaire, vue Maison', path: '/inventaire' },
  { name: 'Inventaire, vue Liste', path: '/inventaire', list: true },
  { name: 'Meuble ouvert', path: firstLocationPath },
  { name: 'À classer', path: '/a-classer' },
  { name: 'Plus', path: '/plus' },
  { name: 'Compte', path: '/plus/compte' },
  { name: 'Administration', path: '/plus/administration' },
  { name: 'Membres', path: '/plus/administration/membres' },
  { name: 'Lieux', path: '/plus/administration/lieux' },
  { name: 'Catégories', path: '/plus/administration/categories' },
  { name: 'Correspondances', path: '/plus/administration/correspondances' },
  { name: 'Fiche produit', path: firstProductPath },
];

async function open(page: Page, screen: Screen) {
  const target = typeof screen.path === 'string' ? screen.path : await screen.path(page);
  await page.goto(target);
  if (screen.list) await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Let the data of the screen arrive.
  await page.waitForLoadState('networkidle');
}

/** Gives the screens something to show: stock close to its date, and a product to classify. */
async function seed(
  page: Page,
  testInfo: { project: { name: string; use: { baseURL?: string } } },
) {
  const tag = testInfo.project.name === 'webkit-mobile' ? 'B' : 'A';
  const headers = { Origin: testInfo.project.use.baseURL! };
  const name = `Produit d’audit ${tag}`;
  const existing = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(name)}&limit=1`)
  ).json()) as { name: string }[];
  if (existing.some((p) => p.name === name)) return;
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
    isFallback: boolean;
  }[];
  const places = (await (await page.request.get('/api/locations')).json()) as {
    id: number;
    name: string;
  }[];
  // Not the Frigo, the Freezer or the Cave: other tests count on their content (a badge changes a link's name).
  const frigo = places.find((l) => l.name === 'Garde-manger')!;
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const fallback = categories.find((c) => c.isFallback)!;
  for (const [label, categoryId, expiryDate] of [
    [name, fallback.id, soon],
    [`${name} bis`, categories.find((c) => !c.isFallback)!.id, null],
  ] as const) {
    const created = await page.request.post('/api/products', {
      headers,
      data: { name: label, categoryId, defaultLocationId: frigo.id },
    });
    const { id: productId } = (await created.json()) as { id: number };
    await page.request.post('/api/stock/adjust', {
      headers,
      data: { productId, locationId: frigo.id, delta: 2, reason: 'manual', expiryDate },
    });
  }
}

test.describe('audit à 360 px', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signIn(page);
    await seed(page, testInfo);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} : axe, défilement, zones tactiles, emoji`, async ({ page }) => {
      await open(page, screen);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);

      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(width.scroll).toBeLessThanOrEqual(width.client);

      const small = await page.evaluate(() => {
        const selector =
          'button, a[href], select, input:not([type=hidden]):not([type=file]), [role=button]';
        const visible = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
        });
        // The bottom bar is on every screen: an empty list would mean a broken selector.
        if (visible.length < 4) return ['aucun élément interactif inspecté'];
        return visible
          .filter((el) => {
            const box = el.getBoundingClientRect();
            return box.height < 43.5 || box.width < 43.5;
          })
          .map(
            (el) =>
              `${el.tagName.toLowerCase()} « ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} »`,
          );
      });
      expect(small).toEqual([]);

      const emoji = await page.evaluate(() =>
        /\p{Extended_Pictographic}/u.test(document.body.innerText),
      );
      expect(emoji).toBe(false);
    });
  }

  test('police Carlito chargée', async ({ page }) => {
    await open(page, SCREENS[0]!);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return (
        document.fonts.check('16px Carlito') &&
        [...document.fonts].some((f) => f.family.includes('Carlito') && f.status === 'loaded')
      );
    });
    expect(loaded).toBe(true);
  });

  test('animations coupées avec prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(await firstLocationPath(page));
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.open-furniture, .open-furniture *')].map((el) =>
        parseFloat(getComputedStyle(el).animationDuration),
      ),
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(Math.max(...durations)).toBeLessThan(0.001);
  });

  test('marges de zone sûre sur la barre d’onglets', async ({ page }) => {
    await open(page, SCREENS[0]!);
    const padding = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigation principale"]')!;
      return getComputedStyle(nav).paddingBottom;
    });
    // env(safe-area-inset-bottom) resolves to 0px in a desktop browser: the rule must exist.
    expect(padding).toMatch(/px$/);
    const css = await page.evaluate(() =>
      [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n'),
    );
    expect(css).toContain('safe-area-inset-bottom');
  });
});
