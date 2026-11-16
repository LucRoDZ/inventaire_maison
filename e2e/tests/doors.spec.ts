import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Both browser projects share one database: each one stocks its own products, on shelves that no
// other test reads (pantry « Étagère 2 », freezer « Tiroir 3 »).
const STOCK = {
  'chromium-mobile': { pantry: 'Riz long des portes', freezer: 'Sorbet citron des portes' },
  'webkit-mobile': { pantry: 'Semoule fine des portes', freezer: 'Épinards hachés des portes' },
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

/** Waits until the doors, the light and the drawers have reached their final state. */
async function settled(page: Page) {
  await expect(page.locator('.fx-scene .fx-door').first()).toBeAttached();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState === 'finished'),
  );
}

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
    await settled(page);
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
});
