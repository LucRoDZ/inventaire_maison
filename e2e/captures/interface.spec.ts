import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ensureBigHouse, signInBigHouse } from '../tests/big-house';

// Every screen of the big house (8 pieces of furniture, 60 products) at the three sizes of the
// interface review, top of the screen and after scrolling: `CAPTURE_DIR=… npx playwright test -c
// playwright.captures.config.ts interface`.

const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 800 },
] as const;
const dir = process.env['CAPTURE_DIR'] ?? path.join(__dirname, 'out');

async function shot(page: Page, name: string, width: number) {
  mkdirSync(dir, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, `${width}-${name}.png`) });
}

/** Scrolls whatever scrolls (the page, or the inner zone when there is one) by 400 px. */
async function scrollDown(page: Page) {
  await page.evaluate(() => {
    const zone = document.querySelector<HTMLElement>('[data-scroll-zone]');
    if (zone) zone.scrollBy(0, 400);
    else window.scrollBy(0, 400);
  });
}

for (const size of SIZES) {
  test(`interface ${size.width}`, async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    await ensureBigHouse(baseURL!, 'C');
    await page.setViewportSize(size);
    await signInBigHouse(page, 'C');
    await page.goto('/inventaire');
    await expect(page.getByRole('link', { name: /^Frigo/ })).toBeVisible();
    await shot(page, '01-maison', size.width);
    await scrollDown(page);
    await shot(page, '02-maison-defile', size.width);
    await page.getByRole('button', { name: /^Filtres/ }).click();
    await shot(page, '03-maison-filtres', size.width);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Liste', exact: true }).click();
    await expect(page.getByText(/Rutabaga 01/)).toBeVisible();
    await shot(page, '04-liste', size.width);
    await scrollDown(page);
    await shot(page, '05-liste-defile', size.width);
    const filters = page.getByRole('button', { name: /^Filtres/ });
    if (await filters.count()) {
      await filters.click();
      await shot(page, '06-liste-filtres', size.width);
      await page.keyboard.press('Escape');
    }
    await page.goto('/inventaire');
    const options = page.getByRole('button', { name: 'Options de Frigo' });
    if (await options.count()) {
      await options.click();
      await shot(page, '07-menu-meuble', size.width);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('link', { name: /^Frigo/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Frigo' })).toBeVisible();
    await shot(page, '08-meuble-ouvert', size.width);
    for (const [name, url] of [
      ['09-plus', '/plus'],
      ['10-meubles', '/plus/meubles'],
      ['11-compte', '/plus/compte'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await shot(page, name, size.width);
    }
    await scrollDown(page);
    await page.goto('/plus/meubles');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await scrollDown(page);
    await shot(page, '12-meubles-defile', size.width);
  });
}
