import { expect, test, type Page } from '@playwright/test';
import { pushCode, signIn, startScanner } from './helpers';

// Silent update: once a new version has taken over (simulated with window.__e2eUpdateReady, set
// in end-to-end builds only), nothing is shown, nothing reloads during an action, and the next
// navigation opens the new version (a full page load).

type MarkedWindow = { __beforeUpdate?: string; __e2eUpdateReady?: () => void };

/** Puts a marker in the page: a full reload removes it, a client navigation keeps it. */
async function mark(page: Page) {
  await page.evaluate(() => {
    (window as MarkedWindow).__beforeUpdate = 'oui';
  });
}
const marked = (page: Page) =>
  page.evaluate(() => (window as MarkedWindow).__beforeUpdate === 'oui');

async function newVersionTakesOver(page: Page) {
  await page.waitForFunction(() => typeof (window as MarkedWindow).__e2eUpdateReady === 'function');
  await page.evaluate(() => (window as MarkedWindow).__e2eUpdateReady?.());
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });

async function expectNothingShown(page: Page) {
  await expect(page.getByText(/nouvelle version|actualiser/i)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('mise à jour silencieuse : rien ne s’affiche, la navigation suivante ouvre la nouvelle version', async ({
  page,
}) => {
  await signIn(page);
  await mark(page);
  await newVersionTakesOver(page);
  // Nothing happens on the current screen: no message, no reload.
  await page.waitForTimeout(1000);
  await expectNothingShown(page);
  expect(await marked(page)).toBe(true);

  await nav(page).getByRole('link', { name: 'Inventaire' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inventaire' })).toBeVisible();
  await expect.poll(() => marked(page)).toBe(false);
  await expectNothingShown(page);

  // Switched once: the following navigations are ordinary client ones again.
  await mark(page);
  await nav(page).getByRole('link', { name: 'Plus' }).click();
  await expect(page).toHaveURL(/\/plus$/);
  await page.waitForTimeout(500);
  expect(await marked(page)).toBe(true);
});

test('mise à jour silencieuse : jamais pendant un scan, caméra active', async ({ page }) => {
  await signIn(page);
  await startScanner(page);
  await mark(page);
  await newVersionTakesOver(page);
  await page.waitForTimeout(1000);
  expect(await marked(page)).toBe(true);
  await expectNothingShown(page);
  // The scan goes on as if nothing happened: a code pushed is still read.
  await pushCode(page, '0000000000000');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await marked(page)).toBe(true);
});

test('mise à jour silencieuse : jamais avec un formulaire modifié, à l’écran suivant ensuite', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/plus/compte');
  const field = page.getByLabel('Mot de passe actuel');
  await field.fill('texte non enregistré');
  await mark(page);
  await newVersionTakesOver(page);
  await page.waitForTimeout(1000);
  expect(await marked(page)).toBe(true);
  await expect(field).toHaveValue('texte non enregistré');
  await expectNothingShown(page);

  // Leaving the screen (the person chose to): the next screen opens in the new version.
  await nav(page).getByRole('link', { name: 'Inventaire' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect.poll(() => marked(page)).toBe(false);
  await expect(page.getByRole('heading', { level: 1, name: 'Inventaire' })).toBeVisible();
});
