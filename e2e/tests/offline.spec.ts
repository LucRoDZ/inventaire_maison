import { expect, test } from '@playwright/test';

// The service worker is exercised on Chromium only.
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium uniquement');

test('hors connexion, la coquille s’ouvre et l’encadré « Pas de connexion » s’affiche', async ({
  page,
  context,
}) => {
  await page.goto('/connexion');
  await page.getByLabel('Pseudo').fill('admin');
  await page.getByLabel('Mot de passe').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();

  // Wait for the worker to control the page, then visit once more so the shell is cached.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Pas de connexion' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Pas de connexion' })).toBeHidden();
});
