import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BIG_TAG, ensureBigHouse, signInBigHouse } from './big-house';

// Clean interface on a full house (8 pieces of furniture, 60 products): a light fixed header,
// every filter in one panel, and one zone that scrolls between the header and the bottom bar.

const PHONES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
// One worker per browser builds the big house once, then reads it: tests of this file run in order.
test.describe.configure({ mode: 'default' });

const tagOf = (project: string) => BIG_TAG[project as keyof typeof BIG_TAG];

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const tag = tagOf(testInfo.project.name);
  await ensureBigHouse(baseURL!, tag);
  await signInBigHouse(page, tag);
});

const header = (page: Page) => page.locator('main > header');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

/** Scrolls the zone by the wheel over it, then checks that only the zone has moved. */
async function scrollZoneAndCheck(page: Page, zoneName: string) {
  const zone = page.getByRole('region', { name: zoneName });
  await expect(zone).toBeVisible();
  await expect(zone).toHaveAttribute('tabindex', '0');
  const before = await header(page).boundingBox();
  const sizes = await zone.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(sizes.scrollHeight).toBeGreaterThan(sizes.clientHeight);
  await zone.evaluate((el) => el.scrollBy(0, 300));
  await expect.poll(() => zone.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await header(page).boundingBox()).toEqual(before);
  await expect(nav(page)).toBeInViewport();
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  // The 1 px line under the header shows once the zone has left its top.
  await expect(zone).toHaveAttribute('data-scrolled', 'true');
  return zone;
}

for (const size of PHONES) {
  test.describe(`${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('en-tête fixe et léger : titre, Filtres, bascule, recherche, et rien d’autre', async ({
      page,
    }) => {
      await page.goto('/inventaire');
      await expect(page.getByRole('link', { name: /^Frigo/ })).toBeVisible();
      await expect(page.getByText('Ma maison')).toHaveCount(0);
      for (const view of ['Maison', 'Liste'] as const) {
        await page.getByRole('button', { name: view, exact: true }).click();
        const top = header(page);
        await expect(top.getByRole('heading', { level: 1, name: 'Inventaire' })).toBeVisible();
        await expect(top.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible();
        await expect(top.getByRole('searchbox', { name: 'Nom ou marque' })).toBeVisible();
        // No chip, no tab, no dropdown of filters in the header.
        await expect(top.getByRole('combobox')).toHaveCount(0);
        await expect(top.getByRole('tab')).toHaveCount(0);
        await expect(top.getByRole('button')).toHaveCount(3); // Filtres, Maison, Liste
        const box = (await top.boundingBox())!;
        if (size.width === 360) expect(box.height).toBeLessThanOrEqual(190);
        const filters = (await top.getByRole('button', { name: 'Filtres' }).boundingBox())!;
        expect(Math.round(filters.width)).toBeGreaterThanOrEqual(44);
        expect(Math.round(filters.height)).toBeGreaterThanOrEqual(44);
        // No horizontal scrollbar anywhere.
        const wide = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('*')]
            .filter((el) => {
              const style = getComputedStyle(el);
              return (
                el.scrollWidth > el.clientWidth + 1 &&
                (style.overflowX === 'auto' || style.overflowX === 'scroll')
              );
            })
            .map((el) => el.className.toString().slice(0, 40)),
        );
        expect(wide).toEqual([]);
      }
    });

    test('défilement : seule la zone défile, position gardée au changement de vue', async ({
      page,
    }) => {
      await page.goto('/inventaire');
      await expect(page.getByRole('link', { name: /^Frigo/ })).toBeVisible();
      const houseZone = await scrollZoneAndCheck(page, 'Liste des meubles');
      const zoneBox = (await houseZone.boundingBox())!;
      if (size.width === 360) expect(zoneBox.height / size.height).toBeGreaterThan(0.6);
      const housePosition = await houseZone.evaluate((el) => el.scrollTop);

      await page.getByRole('button', { name: 'Liste', exact: true }).click();
      await expect(page.getByText(/^Rutabaga 01$/)).toBeVisible();
      await expect(page.getByText(/^\d+ articles · \d+ unités$/)).toBeVisible();
      const listZone = await scrollZoneAndCheck(page, 'Liste des produits');
      await listZone.evaluate((el) => el.scrollBy(0, 400));
      const listPosition = await listZone.evaluate((el) => el.scrollTop);

      await page.getByRole('button', { name: 'Maison', exact: true }).click();
      const back = page.getByRole('region', { name: 'Liste des meubles' });
      await expect.poll(() => back.evaluate((el) => el.scrollTop)).toBe(housePosition);
      await page.getByRole('button', { name: 'Liste', exact: true }).click();
      const again = page.getByRole('region', { name: 'Liste des produits' });
      await expect.poll(() => again.evaluate((el) => el.scrollTop)).toBe(listPosition);
      // The counter is a help line of the list only.
      await page.getByRole('button', { name: 'Maison', exact: true }).click();
      await expect(page.getByText(/^\d+ articles · \d+ unités$/)).toHaveCount(0);

      // Back from an open piece of furniture: the house is where it was.
      await expect.poll(() => back.evaluate((el) => el.scrollTop)).toBe(housePosition);
      await back.evaluate((el) => el.scrollBy(0, 200));
      const before = await back.evaluate((el) => el.scrollTop);
      await page.getByRole('link', { name: /^Mini-frigo du bureau/ }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Mini-frigo du bureau' }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Maison', exact: true }).click();
      const home = page.getByRole('region', { name: 'Liste des meubles' });
      await expect.poll(() => home.evaluate((el) => el.scrollTop)).toBe(before);
    });
  });
}

test('paysage 740 × 360 : la zone se réduit, rien ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/inventaire');
  await expect(page.getByRole('link', { name: /^Frigo/ })).toBeAttached();
  const zone = page.getByRole('region', { name: 'Liste des meubles' });
  const box = (await zone.boundingBox())!;
  const bar = (await nav(page).boundingBox())!;
  expect(box.height).toBeGreaterThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= document.documentElement.clientHeight,
    ),
  ).toBe(true);
});

test('défilement : même principe sur Plus, Meubles et étagères et la fiche produit', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]);
  for (const path of ['/plus', '/plus/meubles', '/plus/compte']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-scroll-zone]')).toHaveCount(1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe('hidden');
  }
  await page.goto('/plus/meubles');
  await scrollZoneAndCheck(page, 'Meubles et étagères');
});

test('grand écran 1440 × 800 : en-tête fixe, zone qui défile, pas de défilement de la fenêtre', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/inventaire');
  await expect(page.getByRole('link', { name: /^Frigo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByText(/^Rutabaga 01$/)).toBeVisible();
  await scrollZoneAndCheck(page, 'Liste des produits');
  const hasWindowScrollbar = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(hasWindowScrollbar).toBe(false);
  await page.getByRole('button', { name: 'Maison', exact: true }).click();
  const columns = await page
    .getByRole('region', { name: 'Liste des meubles' })
    .locator('ul')
    .first()
    .evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length);
  expect(columns).toBeGreaterThanOrEqual(3);
  await axe(page);
});
