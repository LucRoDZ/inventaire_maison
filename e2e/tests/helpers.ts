import { expect, request, type Page } from '@playwright/test';
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
  await expect(page.getByRole('heading', { name: 'Inventaire', level: 1 })).toBeVisible();
}

/**
 * Opens the full-screen scanner (a route of its own, no longer a tab) and waits until it accepts
 * codes. Straight to the route; the Ajouter › Scanner path has its own test.
 */
export async function openScanner(page: Page) {
  if (!/\/scanner$/.test(page.url())) await page.goto('/scanner');
  await startScanner(page);
}

/** The scanner opens its camera by itself (fake engine in end-to-end builds): waits until it accepts codes. */
export async function startScanner(page: Page) {
  await page.waitForFunction(() => typeof (window as E2EWindow).__e2eScan === 'function');
}

/** The scanner ignores the same code read again within 1.5 s: wait that long, as a person would. */
const SAME_CODE_DELAY_MS = 1600;
const lastPushed = new WeakMap<Page, { code: string; at: number }>();

export async function pushCode(page: Page, code: string) {
  const last = lastPushed.get(page);
  if (last?.code === code) {
    const wait = SAME_CODE_DELAY_MS - (Date.now() - last.at);
    if (wait > 0) await page.waitForTimeout(wait);
  }
  lastPushed.set(page, { code, at: Date.now() });
  await page.evaluate((value) => (window as E2EWindow).__e2eScan?.(value), code);
}

/** Owner connection to the e2e database (fixtures only; the application has its own role). */
export const e2eDatabaseUrl = () =>
  process.env['E2E_DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/inventaire_e2e';

/**
 * Inserts a member straight into the e2e database (same Argon2id parameters as the API), in the
 * household of the admin: both see the same inventory.
 */
export async function createMember(username: string, password: string): Promise<void> {
  const url = e2eDatabaseUrl();
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
      `insert into users (username, password_hash, role, household_id)
       values ($1, $2, 'member', (select household_id from users where username = $3))
       on conflict do nothing`,
      [username, hash, USERNAME],
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

/**
 * An account alone in a household of its own (created with the furniture and categories of the
 * model), made through the admin console API. Tests that build big fixtures use one per browser,
 * so that they never share the furniture of the admin (12 at most per household). Idempotent.
 */
export async function ensureAccountInOwnHousehold(
  baseURL: string,
  username: string,
  password: string,
  householdName: string,
): Promise<void> {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const login = await api.post('/api/auth/login', {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const created = await api.post('/api/users', {
      data: { username, password, role: 'member', newHouseholdName: householdName },
    });
    // 409: made by an earlier test of the same run.
    expect([201, 409]).toContain(created.status());
  } finally {
    await api.dispose();
  }
}

/** Household of an account, for fixtures written straight into the e2e database. */
export async function householdOf(username: string): Promise<number> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ household_id: number }>(
      'select household_id from users where username = $1',
      [username],
    );
    return rows[0]!.household_id;
  } finally {
    await client.end();
  }
}

/** List view: keeps only one piece of furniture, through the filter panel of the header. */
export async function filterListByFurniture(page: Page, name: RegExp) {
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filtres' });
  await sheet.getByRole('group', { name: 'Meuble' }).getByRole('radio', { name }).check();
  await sheet.getByRole('button', { name: 'Appliquer' }).click();
  await expect(sheet).toHaveCount(0);
}
