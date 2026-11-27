import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import {
  e2eDatabaseUrl,
  ensureAccountInOwnHousehold,
  furnitureSettled,
  householdOf,
  signIn,
} from './helpers';

// The open furniture fits between the top of the screen and the bottom bar of a phone in portrait:
// the page never scrolls vertically, whatever the furniture (default seed, or 8 full shelves).

const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;

const DEFAULTS = ['Garde-manger', 'Frigo', 'Congélateur', 'Cave'] as const;

/**
 * Both browser projects share one database: each one builds its own big furniture, a cupboard and
 * a freezer of 8 shelves, every shelf and the tray holding two products (the worst case).
 */
const TAG = { 'chromium-mobile': 'A', 'webkit-mobile': 'B' } as const;
const bigFurniture = (tag: string) =>
  [
    { name: `Buffet ${tag} de test`, kind: 'other' },
    { name: `Coffre ${tag} de test`, kind: 'freezer' },
  ] as const;
const SHELVES = 8;

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}

async function places(page: Page): Promise<Place[]> {
  return (await (await page.request.get('/api/locations')).json()) as Place[];
}

/** Exact shelf names and kinds: written straight into the e2e database, in the household given. */
async function insertFurniture(name: string, kind: string, householdId: number): Promise<void> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const found = await client.query(
      'select id from locations where name = $1 and household_id = $2',
      [name, householdId],
    );
    if (found.rowCount) return;
    const { rows } = await client.query<{ id: number }>(
      "insert into locations (household_id, name, kind, icon, sort_order) values ($1, $2, $3, 'warehouse', 90) returning id",
      [householdId, name, kind],
    );
    for (let i = 0; i < SHELVES; i++) {
      await client.query(
        'insert into shelves (household_id, location_id, name, kind, sort_order) values ($1, $2, $3, $4, $5)',
        [householdId, rows[0]!.id, `Rayon ${i + 1}`, i % 3 === 0 ? 'rack' : 'plain', i],
      );
    }
  } finally {
    await client.end();
  }
}

/** Two products on every shelf and on the tray: one « Topinambour » (matches the filter), one « Quenelle ». */
async function fill(page: Page, baseURL: string, place: Place, tag: string): Promise<void> {
  const headers = { Origin: baseURL };
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
    isFallback: boolean;
  }[];
  const categoryId = categories.find((c) => !c.isFallback)!.id;
  const slots: (number | null)[] = [...place.shelves.map((s) => s.id), null];
  for (const [i, shelfId] of slots.entries()) {
    for (const word of ['Topinambour', 'Quenelle']) {
      const created = await page.request.post('/api/products', {
        headers,
        data: { name: `${word} ${tag} ${place.id}-${i}`, categoryId },
      });
      expect(created.ok()).toBe(true);
      const { id: productId } = (await created.json()) as { id: number };
      const adjusted = await page.request.post('/api/stock/adjust', {
        headers,
        data: { productId, locationId: place.id, shelfId, delta: 3, reason: 'manual' },
      });
      expect(adjusted.ok()).toBe(true);
    }
  }
}

async function openPlace(page: Page, name: string) {
  const place = (await places(page)).find((p) => p.name === name)!;
  await page.goto(`/inventaire/${place.id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await furnitureSettled(page);
}

/** Everything the layout must guarantee, measured in the page. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const nav = rect(document.querySelector('nav[aria-label="Navigation principale"]')!);
    const body = rect(document.querySelector('.fx-body')!);
    const sections = [...document.querySelectorAll('.fx-body section')].map((s) => ({
      name: s.getAttribute('aria-label'),
      ...JSON.parse(JSON.stringify(rect(s))),
    })) as { name: string; top: number; bottom: number }[];
    const overlaps: string[] = [];
    for (let i = 1; i < sections.length; i++) {
      if (sections[i]!.top < sections[i - 1]!.bottom - 0.5)
        overlaps.push(`${sections[i - 1]!.name} / ${sections[i]!.name}`);
    }
    const tiles = [...document.querySelectorAll<HTMLElement>('.fx-body .fx-tile')].map((tile) => {
      const box = rect(tile);
      const row = rect(tile.closest('ul')!);
      return {
        side: Math.round(box.width * 10) / 10,
        square: Math.abs(box.width - box.height) < 0.5,
        clipped: box.top < row.top - 0.5 || box.bottom > row.bottom + 0.5,
      };
    });
    const shelvesBox = document.querySelector('.fx-shelves')!;
    const shelvesScroll = shelvesBox.scrollHeight > shelvesBox.clientHeight + 1;
    const rows = [...document.querySelectorAll('.fx-shelves > .fx-row')].map(
      (row) => Math.round(rect(row).height * 10) / 10,
    );
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overlaps,
      // A shelf outside the body (cut by it), or under the bottom bar; when the shelves scroll
      // inside the furniture, those below are reached by scrolling, not cut.
      outside: shelvesScroll
        ? []
        : sections
            .filter((s) => s.top < body.top - 0.5 || s.bottom > body.bottom + 0.5)
            .map((s) => s.name),
      underNav: shelvesScroll
        ? []
        : sections.filter((s) => s.bottom > nav.top + 0.5).map((s) => s.name),
      bodyUnderNav: body.bottom > nav.top + 0.5,
      shelvesScroll,
      rows,
      // Every line of a name shows its text whole (nothing cut at the bottom).
      namesCut: [...document.querySelectorAll<HTMLElement>('.fx-body .fx-shelf-name')]
        .filter((name) => {
          const line = rect(name.parentElement!);
          const box = rect(name);
          return box.bottom > line.bottom + 0.5 || name.scrollHeight > name.clientHeight + 1;
        })
        .map((name) => name.textContent),
      tiles,
      compact: tiles.some((t) => t.side < 44.5),
    };
  });
}

function expectFits(state: Awaited<ReturnType<typeof layout>>, label: string) {
  expect(state.scrollHeight, label).toBeLessThanOrEqual(state.innerHeight);
  expect(state.scrollWidth, label).toBeLessThanOrEqual(state.clientWidth);
  expect(state.overlaps, label).toEqual([]);
  expect(state.outside, label).toEqual([]);
  expect(state.underNav, label).toEqual([]);
  expect(state.bodyUnderNav, label).toBe(false);
  // A fixed height for every shelf, whatever their number: more shelves scroll, never shrink.
  for (const row of state.rows) expect(row, label).toBe(132);
  expect(state.namesCut, label).toEqual([]);
  for (const tile of state.tiles) {
    expect(tile.side, label).toBeGreaterThanOrEqual(43.5);
    expect(tile.side, label).toBeLessThanOrEqual(96.5);
    expect(tile.square, label).toBe(true);
    expect(tile.clipped, label).toBe(false);
  }
}

// One worker for this file: the big furniture is built once per project.
test.describe.configure({ mode: 'default' });

test.describe('meuble ouvert : la page ne défile pas, les étagères gardent leur hauteur', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const tag = TAG[testInfo.project.name as keyof typeof TAG];
    // Its own account and household per browser: the furniture of the admin stays untouched.
    const account = `ajuste-${tag.toLowerCase()}`;
    await ensureAccountInOwnHousehold(
      testInfo.project.use.baseURL!,
      account,
      'mot-de-passe-ajuste',
      `Ajustement ${tag}`,
    );
    await signIn(page, account, 'mot-de-passe-ajuste');
    const householdId = await householdOf(account);
    for (const { name, kind } of bigFurniture(tag)) {
      await insertFurniture(name, kind, householdId);
      const place = (await places(page)).find((p) => p.name === name)!;
      const home = (await (await page.request.get('/api/home')).json()) as {
        locations: { id: number; unshelved: unknown[] }[];
      };
      if (home.locations.find((l) => l.id === place.id)!.unshelved.length === 0)
        await fill(page, testInfo.project.use.baseURL!, place, tag);
    }
  });

  for (const size of SIZES) {
    test(`${size.width} × ${size.height} : seed par défaut et 8 étagères pleines, à hauteur fixe`, async ({
      page,
    }, testInfo) => {
      const tag = TAG[testInfo.project.name as keyof typeof TAG];
      await page.setViewportSize(size);
      const names = [...DEFAULTS, ...bigFurniture(tag).map((f) => f.name)];
      for (const name of names) {
        await openPlace(page, name);
        const state = await layout(page);
        const label = `${name} à ${size.width} × ${size.height}`;
        expectFits(state, label);
        testInfo.annotations.push({
          type: 'mesure',
          description: `${label} : ${state.tiles.length} vignettes, côté ${
            state.tiles.length ? Math.min(...state.tiles.map((t) => t.side)) : '-'
          } px${state.compact ? ' (très compact)' : ''}`,
        });
      }
    });
  }

  test('filtres : panneau, vignettes estompées, rappel qui apparaît puis disparaît, focus rendu', async ({
    page,
  }, testInfo) => {
    const tag = TAG[testInfo.project.name as keyof typeof TAG];
    const [cupboard] = bigFurniture(tag);
    await page.setViewportSize(SIZES[0]);
    await openPlace(page, cupboard.name);

    const button = page.getByRole('button', { name: 'Filtres', exact: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('filter-reminder')).toHaveCount(0);
    await button.click();
    const sheet = page.getByRole('dialog', { name: 'Filtres' });
    await expect(sheet).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await sheet.getByRole('searchbox', { name: 'Nom ou marque' }).fill('topinambour');
    await sheet.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page).toHaveURL(/\?q=topinambour$/);

    // Applied: the sheet closes and gives the focus back to the button, now with its badge.
    await expect(sheet).toHaveCount(0);
    const active = page.getByRole('button', { name: 'Filtres', exact: true });
    await expect(active).toBeFocused();
    await expect(active).toHaveAttribute('aria-expanded', 'false');
    await expect(active.getByTestId('filters-badge')).toHaveText('1');

    // What does not match fades; what matches stays.
    const quenelle = page.getByRole('button', {
      name: new RegExp(`^Quenelle ${tag} .*, quantité 3$`),
    });
    const topinambour = page.getByRole('button', {
      name: new RegExp(`^Topinambour ${tag} .*, quantité 3$`),
    });
    await expect(quenelle.first()).toHaveClass(/opacity-30/);
    await expect(topinambour.first()).not.toHaveClass(/opacity-30/);

    // The reminder takes its 32 px from the shelves: still no vertical scroll.
    const reminder = page.getByTestId('filter-reminder');
    await expect(reminder).toContainText('topinambour');
    expect(Math.round((await reminder.boundingBox())!.height)).toBe(32);
    await expect.poll(async () => (await layout(page)).overlaps).toEqual([]);
    expectFits(await layout(page), 'filtre actif');

    // Cleared from the reminder: it goes away, the tiles come back, still no scroll.
    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    await expect(reminder).toHaveCount(0);
    await expect(page).toHaveURL(/\/inventaire\/\d+$/);
    await expect(quenelle.first()).not.toHaveClass(/opacity-30/);
    await expect(page.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible();
    expectFits(await layout(page), 'filtre effacé');
  });

  test('barre du haut : retour en icône vers Maison avec le filtre, titre h1 tronqué', async ({
    page,
  }) => {
    await page.setViewportSize(SIZES[0]);
    const frigo = (await places(page)).find((p) => p.name === 'Frigo')!;
    await page.goto(`/inventaire/${frigo.id}?q=beurre`);
    const title = page.getByRole('heading', { level: 1, name: 'Frigo' });
    await expect(title).toBeVisible();
    expect(await title.evaluate((h) => getComputedStyle(h).textOverflow)).toBe('ellipsis');
    const back = page.getByRole('link', { name: 'Maison', exact: true });
    const box = (await back.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL(/\/inventaire\?q=beurre$/);
  });

  test('paysage : le meuble défile dans sa zone (jamais la page), rien n’est rogné', async ({
    page,
  }, testInfo) => {
    const tag = TAG[testInfo.project.name as keyof typeof TAG];
    await page.setViewportSize({ width: 740, height: 360 });
    await openPlace(page, bigFurniture(tag)[0].name);
    const state = await layout(page);
    expect(state.overlaps).toEqual([]);
    expect(state.outside).toEqual([]);
    for (const tile of state.tiles) expect(tile.clipped).toBe(false);
    // The page never scrolls; the furniture scrolls inside the screen, under its top bar.
    expect(state.scrollHeight).toBeLessThanOrEqual(state.innerHeight);
    const inner = await page
      .locator('main')
      .evaluate((main) =>
        [...main.querySelectorAll<HTMLElement>('div')].some(
          (el) =>
            getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1,
        ),
      );
    expect(inner).toBe(true);
  });
});
