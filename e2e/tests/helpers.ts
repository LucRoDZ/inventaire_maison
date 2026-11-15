import { expect, type Page } from '@playwright/test';
import * as argon2 from 'argon2';
import pg from 'pg';

type E2EWindow = { __e2eScan?: (code: string) => void };

export const USERNAME = 'admin';
export const PASSWORD = 'e2e-admin-password';

/**
 * Waits until React has hydrated the page. A field filled before that is wiped by the hydration
 * (the server-rendered form is replaced by the controlled one), which made logins flaky.
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const field = document.querySelector('input, button');
    return !!field && Object.keys(field).some((key) => key.startsWith('__reactProps'));
  });
}

export async function signIn(page: Page, username = USERNAME, password = PASSWORD) {
  await page.goto('/connexion');
  await waitForHydration(page);
  await page.getByLabel('Pseudo').fill(username);
  await page.getByLabel('Mot de passe').fill(password);
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

/**
 * Inserts a member straight into the e2e database (same Argon2id parameters as the API). Used
 * until the tests can create one through the administration screen.
 */
export async function createMember(username: string, password: string): Promise<void> {
  const url =
    process.env['E2E_DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/inventaire_e2e';
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "insert into users (username, password_hash, role) values ($1, $2, 'member') on conflict do nothing",
      [username, hash],
    );
  } finally {
    await client.end();
  }
}
