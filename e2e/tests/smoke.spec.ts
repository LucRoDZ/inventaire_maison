import { expect, test } from '@playwright/test';

test('la page d’accueil charge et expose son titre', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Inventaire maison');
});
