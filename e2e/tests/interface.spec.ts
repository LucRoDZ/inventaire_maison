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

    test('le bas de la zone n’est jamais caché par la barre, même plus haute que prévu', async ({
      page,
    }) => {
      // A real phone adds its safe area and its own font metrics to the bar: make it 34 px taller.
      await page.addStyleTag({
        content: 'nav[aria-label="Navigation principale"] { padding-bottom: 34px !important; }',
      });
      for (const url of ['/inventaire', '/inventaire?vue=liste']) {
        await page.goto(url);
        const zone = page.locator('[data-scroll-zone]');
        await expect(zone).toBeVisible();
        await page.waitForLoadState('networkidle');
        const m = await zone.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          const last = el.firstElementChild!.lastElementChild!.getBoundingClientRect();
          const bar = document
            .querySelector('nav[aria-label="Navigation principale"]')!
            .getBoundingClientRect();
          return { last: last.bottom, zone: el.getBoundingClientRect().bottom, bar: bar.top };
        });
        expect(m.zone, url).toBeLessThanOrEqual(m.bar + 0.5);
        expect(m.last, url).toBeLessThanOrEqual(m.bar - 16);
      }
    });

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

test('filtres : meuble et catégorie, pastille, rappel, recherche combinée, état gardé, Effacer et Réinitialiser', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[1]);
  await page.goto('/inventaire');
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  const zone = page.getByRole('region', { name: 'Liste des produits' });
  await expect(zone.getByText('60 articles · 120 unités')).toBeVisible();
  const reminder = page.getByTestId('filter-reminder');
  const filters = page.getByRole('button', { name: 'Filtres', exact: true });
  const badge = filters.getByTestId('filters-badge');
  await expect(reminder).toHaveCount(0);
  await expect(badge).toHaveCount(0);

  // Furniture and category, applied together (« Rutabaga 02 » is a wine in the fridge).
  await filters.click();
  const sheet = page.getByRole('dialog', { name: 'Filtres' });
  await expect(sheet.getByRole('group', { name: 'Meuble' }).getByRole('radio')).toHaveCount(9);
  await sheet.getByRole('radio', { name: /^Frigo/ }).check();
  await sheet.getByRole('checkbox', { name: 'Alcools et vins' }).check();
  await sheet.getByRole('button', { name: 'Appliquer' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeFocused();
  await expect(badge).toHaveText('2');
  await expect(reminder).toContainText('Frigo · Alcools et vins');
  expect(Math.round((await reminder.boundingBox())!.height)).toBe(32);
  const cards = zone.locator('article');
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allTextContents()) expect(text).toContain('Frigo');
  await expect(zone.getByRole('button', { name: /^Alcools et vins/ })).toBeVisible();
  await expect(zone.getByRole('button', { name: /^Viandes/ })).toHaveCount(0);
  const filtered = await cards.count();

  // The search narrows what the filters keep.
  const search = page.getByRole('searchbox', { name: 'Nom ou marque' });
  // Typed key by key, space included: the URL coming back trimmed never eats it.
  await search.pressSequentially('Rutabaga 02', { delay: 30 });
  await expect(search).toHaveValue('Rutabaga 02');
  await expect.poll(() => cards.count()).toBeLessThanOrEqual(filtered);
  for (const text of await cards.allTextContents()) expect(text).toContain('Rutabaga 02');

  // Kept across the views: the house keeps the search and the category (not the furniture).
  await page.getByRole('button', { name: 'Maison', exact: true }).click();
  await expect(search).toHaveValue('Rutabaga 02');
  await expect(badge).toHaveText('1');
  await expect(reminder).toContainText('Alcools et vins');
  await expect(reminder).not.toContainText('Frigo');
  await expect(page.locator('a.fx-card[data-match="true"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(badge).toHaveText('2');
  await expect(reminder).toContainText('Frigo · Alcools et vins');

  // « Effacer » clears the filters, the search stays.
  await reminder.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(reminder).toHaveCount(0);
  await expect(badge).toHaveCount(0);
  await expect(search).toHaveValue('Rutabaga 02');

  // « Réinitialiser » from the panel.
  await search.fill('');
  await filters.click();
  await sheet.getByRole('checkbox', { name: 'Viandes' }).check();
  await sheet.getByRole('button', { name: 'Appliquer' }).click();
  await expect(reminder).toContainText('Viandes');
  await filters.click();
  await expect(sheet.getByRole('checkbox', { name: 'Viandes' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(reminder).toHaveCount(0);
  await expect(zone.getByText('60 articles · 120 unités')).toBeVisible();
});

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
  // Closed lines are short: one opened line makes the zone scroll.
  await page
    .getByRole('listitem', { name: 'Meuble Frigo' })
    .getByRole('button', { name: /^Frigo/ })
    .click();
  await scrollZoneAndCheck(page, 'Meubles et étagères');
});

test('Meubles et étagères : une ligne par meuble, une seule dépliée, icônes en grille, axe', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]);
  await page.goto('/plus/meubles');
  await expect(page.getByRole('listitem', { name: /^Meuble / })).toHaveCount(8);
  await expect(page.locator('select:has(option:nth-child(20))')).toHaveCount(0);
  const toggle = (name: string) =>
    page
      .getByRole('listitem', { name: `Meuble ${name}` })
      .getByRole('button', { name: new RegExp(`^${name}`) });
  await toggle('Frigo').click();
  await expect(toggle('Frigo')).toHaveAttribute('aria-expanded', 'true');
  await toggle('Cave').click();
  await expect(toggle('Cave')).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle('Frigo')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[aria-expanded="true"]')).toHaveCount(1);
  const cave = page.getByRole('listitem', { name: 'Meuble Cave' });
  await expect(cave.getByRole('button', { name: 'Enregistrer', exact: true })).toBeVisible();
  await expect(cave.getByRole('button', { name: 'Ajouter une étagère' })).toBeVisible();
  await axe(page);
  await cave.getByRole('button', { name: /Changer l’icône/ }).click();
  const icons = page.getByRole('dialog', { name: 'Icône de Cave' });
  await expect(icons.getByRole('radiogroup')).toBeVisible();
  await axe(page);
  await page.keyboard.press('Escape');
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
