import { expect, test, type Page } from '@playwright/test';
import { furnitureScenery, furnitureSettled, signIn } from './helpers';

// Both browser projects share one database: each one stocks its own products, on shelves that no
// other test reads (pantry « Étagère 2 », freezer « Tiroir 3 »).
const STOCK = {
  'chromium-mobile': { pantry: 'Quinoa des portes', freezer: 'Sorbet des portes' },
  'webkit-mobile': { pantry: 'Boulgour des portes', freezer: 'Épinards des portes' },
} as const;

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}

async function places(page: Page): Promise<Place[]> {
  return (await (await page.request.get('/api/locations')).json()) as Place[];
}

/** Puts `quantity` units of a product on a shelf, once. */
async function stock(
  page: Page,
  baseURL: string,
  product: string,
  placeName: string,
  shelfName: string,
  quantity: number,
) {
  const existing = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(product)}&limit=5`)
  ).json()) as { name: string }[];
  if (existing.some((p) => p.name === product)) return;
  const headers = { Origin: baseURL };
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
    isFallback: boolean;
  }[];
  const place = (await places(page)).find((p) => p.name === placeName)!;
  const shelf = place.shelves.find((s) => s.name === shelfName)!;
  const created = await page.request.post('/api/products', {
    headers,
    data: { name: product, categoryId: categories.find((c) => !c.isFallback)!.id },
  });
  const { id: productId } = (await created.json()) as { id: number };
  const adjusted = await page.request.post('/api/stock/adjust', {
    headers,
    data: {
      productId,
      locationId: place.id,
      shelfId: shelf.id,
      delta: quantity,
      reason: 'manual',
    },
  });
  expect(adjusted.ok()).toBe(true);
}

async function openPlace(page: Page, name: string) {
  const place = (await places(page)).find((p) => p.name === name)!;
  await page.goto(`/inventaire/${place.id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const DOORS = { Frigo: 1, Congélateur: 1, 'Garde-manger': 2, Cave: 2 } as const;

// One worker for this file: every test stocks the same products first, which must happen once.
test.describe.configure({ mode: 'default' });

test.describe('portes de la Vue Maison', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const mine = STOCK[testInfo.project.name as keyof typeof STOCK];
    const baseURL = testInfo.project.use.baseURL!;
    await signIn(page);
    await stock(page, baseURL, mine.pantry, 'Garde-manger', 'Étagère 2', 6);
    await stock(page, baseURL, mine.freezer, 'Congélateur', 'Tiroir 3', 2);
  });

  test('vignette : bouton de 80 × 80 au même nom, pile décorative autour, jamais rognée', async ({
    page,
  }, testInfo) => {
    const { pantry } = STOCK[testInfo.project.name as keyof typeof STOCK];
    await openPlace(page, 'Garde-manger');
    await furnitureSettled(page);
    const shelf = page.getByRole('region', { name: 'Étagère 2' });
    const tile = shelf.getByRole('button', { name: `${pantry}, quantité 6` });
    await expect(tile).toBeVisible();
    const box = (await tile.boundingBox())!;
    expect(Math.round(box.width)).toBe(80);
    expect(Math.round(box.height)).toBe(80);

    const pile = await tile.evaluate((button) => {
      const wrapper = button.parentElement!;
      const row = button.closest('ul')!.getBoundingClientRect();
      const cards = [...wrapper.querySelectorAll<HTMLElement>(':scope > .fx-pile-card')];
      return {
        cards: cards.length,
        inside: button.querySelectorAll('.fx-pile-card').length,
        hidden: cards.every((card) => card.getAttribute('aria-hidden') === 'true'),
        inert: cards.every((card) => getComputedStyle(card).pointerEvents === 'none'),
        // The row scrolls sideways and clips what sticks out: every card must fit inside it.
        clipped: cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.top < row.top - 0.5 || rect.bottom > row.bottom + 0.5;
        }).length,
        // The furthest card is 12 px up and to the right of the button.
        offset: cards.length
          ? Math.round(
              button.getBoundingClientRect().top - cards.at(-1)!.getBoundingClientRect().top,
            )
          : 0,
      };
    });
    expect(pile).toEqual({
      cards: 4,
      inside: 0,
      hidden: true,
      inert: true,
      clipped: 0,
      offset: 12,
    });

    // The pile takes no tap: the button still opens the product panel.
    await tile.click();
    await expect(page.getByRole('dialog', { name: pantry })).toBeVisible();
  });

  test('congélateur : trois tiroirs glissés en place, contenu toujours visible', async ({
    page,
  }, testInfo) => {
    const { freezer } = STOCK[testInfo.project.name as keyof typeof STOCK];
    await openPlace(page, 'Congélateur');
    await furnitureSettled(page);
    const drawers = page.locator('section.fx-drawer');
    await expect(drawers).toHaveCount(3);
    expect(
      await drawers.evaluateAll((all) => all.map((d) => d.getAttribute('aria-label'))),
    ).toEqual(['Tiroir 1', 'Tiroir 2', 'Tiroir 3']);
    // Slid in: fully opaque, back to their place, one after the other (60 ms apart).
    expect(
      await drawers.evaluateAll((all) =>
        all.map((d) => {
          const style = getComputedStyle(d);
          // A finished animation leaves the identity matrix rather than « none ».
          const inPlace = ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(style.transform);
          return [style.opacity, inPlace ? 'in place' : style.transform, style.animationDelay];
        }),
      ),
    ).toEqual([
      ['1', 'in place', '0s'],
      ['1', 'in place', '0.06s'],
      ['1', 'in place', '0.12s'],
    ]);
    const third = page.getByRole('region', { name: 'Tiroir 3' });
    await expect(third.getByText(/^\d+ articles?$/)).toBeVisible();
    // Nothing to open: the content is there, and it answers a tap.
    const tile = third.getByRole('button', { name: `${freezer}, quantité 2` });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.getByRole('dialog', { name: freezer })).toBeVisible();
  });

  for (const width of [360, 430]) {
    test(`meubles ouverts à ${width} px : portes dans leur bande, lumière allumée, page sans défilement horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 932 });
      for (const [name, doors] of Object.entries(DOORS)) {
        await openPlace(page, name);
        await expect(page.locator('.fx-scene .fx-door')).toHaveCount(doors);
        await furnitureSettled(page);
        const state = await furnitureScenery(page);
        const label = `${name} à ${width} px`;
        // The sequence of the framing document: the door in 600 ms, nothing longer.
        expect(state.longest, label).toBe(600);
        // Open, each door stands beside the body: it never covers a shelf, and it is still seen.
        for (const overlap of state.overlap) expect(overlap, label).toBeLessThanOrEqual(1);
        for (const doorWidth of state.doorWidths) {
          expect(doorWidth, label).toBeGreaterThanOrEqual(8);
          expect(doorWidth, label).toBeLessThan(state.bodyWidth / 3);
        }
        expect(state.back, label).toEqual(Array.from({ length: doors }, () => 1));
        // One blurred halo, lit; a spot above each shelf of the cupboards only.
        expect(state.light, label).toEqual([0.85]);
        expect(state.spots.length > 0, label).toBe(doors === 2);
        for (const spot of state.spots) expect(spot, label).toBe(0.85);
        // Room for at least two tiles side by side in the body.
        expect(state.bodyWidth, label).toBeGreaterThanOrEqual(240);

        const whole = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          // Scenery only: no door, light or frost can take a tap or the focus.
          tappable: [
            ...document.querySelectorAll('.fx-door, .fx-light, .fx-frost, .fx-spot'),
          ].filter(
            (el) =>
              getComputedStyle(el).pointerEvents !== 'none' ||
              el.closest('[aria-hidden="true"]') === null ||
              el.matches('a, button, [tabindex]'),
          ).length,
        }));
        expect(whole.scroll, label).toBeLessThanOrEqual(whole.client);
        expect(whole.tappable, label).toBe(0);
      }
    });
  }

  test('écran Maison : portes fermées, entrouvertes et allumées sur un résultat de recherche, penchées à l’appui', async ({
    page,
  }, testInfo) => {
    const { pantry } = STOCK[testInfo.project.name as keyof typeof STOCK];
    await page.goto('/inventaire');
    const card = (name: string) => page.getByRole('link', { name: new RegExp(`^${name}`) });
    await expect(card('Garde-manger')).toBeVisible();
    /** Cosine of the angle of each door of a card (1: closed), and the opacity of its light. */
    const look = (name: string) =>
      card(name).evaluate((link) => ({
        doors: [...link.querySelectorAll('.fx-card-door')].map(
          (door) =>
            Math.round(new DOMMatrixReadOnly(getComputedStyle(door).transform).m11 * 1000) / 1000,
        ),
        light: Number(getComputedStyle(link.querySelector('.fx-card-light')!).opacity),
        match: link.getAttribute('data-match'),
        ring: link.classList.contains('ring-amber'),
      }));
    const closed = (doors: number) => ({
      doors: Array.from({ length: doors }, () => 1),
      light: 0,
      match: null,
      ring: false,
    });

    // Closed: one door on the fridge and the freezer, two on the pantry and the cellar.
    expect(await look('Frigo')).toEqual(closed(1));
    expect(await look('Congélateur')).toEqual(closed(1));
    expect(await look('Garde-manger')).toEqual(closed(2));
    expect(await look('Cave')).toEqual(closed(2));

    // Search: the furniture holding a result keeps its amber ring, doors ajar at 12°, light on.
    const search = page.getByRole('searchbox', { name: 'Rechercher dans la maison' });
    await search.fill(pantry);
    const ajar = Math.round(Math.cos((12 * Math.PI) / 180) * 1000) / 1000;
    await expect
      .poll(() => look('Garde-manger'))
      .toEqual({ doors: [ajar, ajar], light: 0.85, match: 'true', ring: true });
    expect(await look('Cave')).toEqual(closed(2));
    await search.fill('');
    await expect.poll(() => look('Garde-manger')).toEqual(closed(2));

    // Press: the door tilts to 20° with the halo, as feedback; the pointer leaves, nothing opens.
    // (The fridge is on the first row: never under the bottom bar, whatever the phone.)
    const box = (await card('Frigo').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = Math.round(Math.cos((20 * Math.PI) / 180) * 1000) / 1000;
    await expect.poll(() => look('Frigo')).toMatchObject({ doors: [pressed], light: 0.85 });
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/inventaire$/);
    await expect.poll(() => look('Frigo')).toEqual(closed(1));
  });

  test('mouvement réduit : le meuble apparaît ouvert et allumé, sans transition ni retard', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [name, doors] of Object.entries(DOORS)) {
      await openPlace(page, name);
      await expect(page.locator('.fx-scene .fx-door')).toHaveCount(doors);
      // Not a matter of waiting: the timing itself says there is neither transition nor delay.
      const timing = await furnitureScenery(page);
      expect(timing.animations, name).toBeGreaterThan(doors);
      // 0.01 ms by the global rule, and no delay left (it was 200 ms for the light).
      expect(timing.longest, name).toBeLessThan(1);
      await furnitureSettled(page);
      const state = await furnitureScenery(page);
      // Doors open: each one stands in its band, beside the body, showing its back.
      for (const overlap of state.overlap) expect(overlap, name).toBeLessThanOrEqual(1);
      for (const width of state.doorWidths) expect(width, name).toBeLessThan(state.bodyWidth / 3);
      expect(state.back, name).toEqual(Array.from({ length: doors }, () => 1));
      expect(state.light, name).toEqual([0.85]);
      for (const spot of state.spots) expect(spot, name).toBe(0.85);
      for (const drawer of state.drawers) expect(drawer, name).toBe(1);
    }
  });
});
