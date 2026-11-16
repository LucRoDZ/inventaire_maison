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

/**
 * Signs in. The install invitation (shown on iOS from the first sign-in) is dismissed for good
 * beforehand so that it does not cover the screens under test; the install test keeps it.
 */
export async function signIn(
  page: Page,
  username = USERNAME,
  password = PASSWORD,
  { keepInstallInvite = false }: { keepInstallInvite?: boolean } = {},
) {
  if (!keepInstallInvite) {
    await page.addInitScript(() => {
      window.localStorage.setItem('inventaire.install', '{"kind":"never"}');
    });
  }
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

/** Waits until the doors, the light and the drawers have reached their final state. */
export async function furnitureSettled(page: Page) {
  await expect(page.locator('.fx-scene .fx-door').first()).toBeAttached();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState === 'finished'),
  );
}

/** What the scenery of the open furniture looks like right now, measured in the page. */
export async function furnitureScenery(page: Page) {
  return page.evaluate(() => {
    const scene = document.querySelector('.fx-scene')!;
    const body = scene.querySelector('.fx-body')!.getBoundingClientRect();
    const animations = document
      .getAnimations()
      .filter((animation) => scene.contains((animation.effect as KeyframeEffect).target));
    const opacity = (selector: string) =>
      [...scene.querySelectorAll(selector)].map((el) => Number(getComputedStyle(el).opacity));
    return {
      kind: scene.getAttribute('data-kind'),
      animations: animations.length,
      finished: animations.every((animation) => animation.playState === 'finished'),
      // Delay and duration together, in ms: the longest wait before the final state.
      longest: Math.max(
        ...animations.map((animation) => Number(animation.effect!.getComputedTiming().endTime)),
      ),
      // How far each open door reaches over the body, in px (0 or less: it stays in its band).
      overlap: [...scene.querySelectorAll('.fx-door')].map((door) => {
        const rect = door.getBoundingClientRect();
        return Math.round(
          door.getAttribute('data-hinge') === 'left'
            ? rect.right - body.left
            : body.right - rect.left,
        );
      }),
      doorWidths: [...scene.querySelectorAll('.fx-door')].map((door) =>
        Math.round(door.getBoundingClientRect().width),
      ),
      bodyWidth: Math.round(body.width),
      back: opacity('.fx-door-back'),
      light: opacity('.fx-light'),
      spots: opacity('.fx-spot'),
      drawers: opacity('.fx-drawer'),
    };
  });
}
