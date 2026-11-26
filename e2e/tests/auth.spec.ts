import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './helpers';

const USERNAME = 'admin';
const PASSWORD = 'e2e-admin-password';

async function signIn(page: Page, username = USERNAME, password = PASSWORD) {
  // The iOS install invitation would cover « Se déconnecter » (tested in its own spec).
  await page.addInitScript(() => {
    window.localStorage.setItem('inventaire.install', '{"kind":"never"}');
  });
  await page.goto('/connexion');
  await waitForHydration(page);
  await page.getByLabel('Pseudo').fill(username);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('sans session, toute page renvoie vers la connexion', async ({ page }) => {
  for (const path of ['/', '/scanner', '/inventaire', '/plus']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/connexion$/);
  }
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});

test('un mauvais mot de passe affiche une erreur', async ({ page }) => {
  await signIn(page, USERNAME, 'mauvais-mot-de-passe');
  await expect(page.getByRole('alert').filter({ hasText: 'Pseudo ou mot de passe' })).toContainText(
    'Pseudo ou mot de passe incorrect',
  );
  await expect(page).toHaveURL(/\/connexion$/);
});

test('connexion, rechargement toujours connecté, onglets, déconnexion', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();

  // The scanner is full screen: no bottom bar. « Fermer le scanner » leaves it.
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav).toHaveCount(0);
  await page.goto('/inventaire');
  await expect(nav.getByRole('link', { name: 'Scanner' })).toHaveAttribute('href', '/scanner');
  await nav.getByRole('link', { name: 'Scanner' }).click();
  await expect(page).toHaveURL(/\/scanner$/);
  await page.getByRole('button', { name: 'Fermer le scanner' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect(nav.getByRole('link', { name: 'Inventaire' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await page.goto('/inventaire');
  await expect(page).toHaveURL(/\/connexion$/);
});
