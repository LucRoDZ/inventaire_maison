import { expect, type Page } from '@playwright/test';

type E2EWindow = { __e2eScan?: (code: string) => void };

export const USERNAME = 'admin';
export const PASSWORD = 'e2e-admin-password';

export async function signIn(page: Page) {
  await page.goto('/connexion');
  await page.getByLabel('Pseudo').fill(USERNAME);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Scanner' })).toBeVisible();
}

/** Starts the scanner (fake engine in end-to-end builds) and waits until it accepts codes. */
export async function startScanner(page: Page) {
  await page.getByRole('button', { name: 'Scanner', exact: true }).click();
  await page.waitForFunction(() => typeof (window as E2EWindow).__e2eScan === 'function');
}

export async function pushCode(page: Page, code: string) {
  await page.evaluate((value) => (window as E2EWindow).__e2eScan?.(value), code);
}
