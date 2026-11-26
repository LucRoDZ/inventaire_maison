import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ensureAccountInOwnHousehold,
  furnitureSettled,
  pushCode,
  signIn,
  startScanner,
} from './helpers';

/**
 * Households and modular furniture, end to end: a « Frigo 2 » created, stocked, opened and deleted
 * with its stock moved; two households that never see each other, online or offline; the admin
 * console that creates « Foyer Dupont » and an account in it. Each browser and each screen size
 * works in households of its own (the database is shared).
 */

const TAG = { 'chromium-mobile': 'a', 'webkit-mobile': 'b' } as const;
const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
const tagOf = (projectName: string) => TAG[projectName as keyof typeof TAG];

async function api(page: Page, baseURL: string) {
  const headers = { Origin: baseURL };
  return {
    get: async <T>(url: string) => (await (await page.request.get(url)).json()) as T,
    post: async <T>(url: string, data: object) => {
      const res = await page.request.post(url, { headers, data });
      expect(res.ok(), `${url} ${res.status()}`).toBe(true);
      return (await res.json()) as T;
    },
  };
}

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}

/** No vertical scrolling of the page (the open furniture fits the screen). */
async function expectNoVerticalScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight + 1),
    )
    .toBe(true);
}

async function axe(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

for (const size of SIZES) {
  test(`${size.width} × ${size.height} : créer « Frigo 2 », y ranger un produit, ouvrir chaque frigo, supprimer avec transfert`, async ({
    page,
  }, testInfo) => {
    const tag = tagOf(testInfo.project.name);
    const baseURL = testInfo.project.use.baseURL!;
    const account = `meubles-${tag}-${size.width}`;
    await ensureAccountInOwnHousehold(
      baseURL,
      account,
      'mot-de-passe-meubles',
      `Meubles ${tag} ${size.width}`,
    );
    await page.setViewportSize(size);
    await signIn(page, account, 'mot-de-passe-meubles');
    await page.goto('/inventaire');

    // The creation sheet, opened from the last tile of the house.
    const add = page.getByRole('button', { name: 'Ajouter un meuble' });
    await add.click();
    const sheet = page.getByRole('dialog', { name: 'Ajouter un meuble' });
    await expect(sheet.getByRole('radio', { name: 'Frigo' })).toBeFocused();
    await expect(sheet.getByLabel('Nom du meuble')).toHaveValue('Frigo 2');
    if (size.width === 360) await axe(page, '[role="dialog"]');
    await sheet.getByRole('button', { name: 'Ajouter le meuble' }).click();
    await expect(sheet).toBeHidden();
    const card = page.getByRole('link', { name: /^Frigo 2/ });
    await expect(card).toBeFocused();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: 'Meuble « Frigo 2 » ajouté' }),
    ).toHaveCount(1);

    // A product on its first shelf (through the API, as the add sheet would).
    const client = await api(page, baseURL);
    const places = await client.get<Place[]>('/api/locations');
    const frigo2 = places.find((p) => p.name === 'Frigo 2')!;
    const categories = await client.get<{ id: number }[]>('/api/categories');
    const product = `Panais ${tag}${size.width}`;
    const created = await client.post<{ id: number }>('/api/products', {
      name: product,
      categoryId: categories[0]!.id,
    });
    await client.post('/api/stock/adjust', {
      productId: created.id,
      locationId: frigo2.id,
      shelfId: frigo2.shelves[0]!.id,
      delta: 2,
      reason: 'manual',
    });

    // Both fridges side by side, each named under its card; each opens without vertical scroll.
    await page.goto('/inventaire');
    await expect(page.getByRole('link', { name: /^Frigo\s*\d+ articles?/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Frigo 2/ })).toContainText('1 article');
    for (const name of ['Frigo', 'Frigo 2']) {
      await page.goto('/inventaire');
      await page.getByRole('link', { name: new RegExp(`^${name}\\s*\\d+ articles?`) }).click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await furnitureSettled(page);
      await expectNoVerticalScroll(page);
    }
    await expect(page.getByRole('button', { name: `${product}, quantité 2` })).toBeVisible();

    // Delete it from the furniture screen: the dialog names it, the stock goes to « Frigo ».
    await page.goto('/plus/meubles');
    const region = page.getByRole('listitem', { name: 'Meuble Frigo 2' });
    await region.getByRole('button', { name: /^Frigo 2/ }).click();
    await region.getByRole('button', { name: 'Supprimer ce meuble' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Supprimer Frigo 2 ?' });
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await expect(dialog).toContainText('Son produit sera rangé dans le plateau « Non rangé »');
    if (size.width === 360) await axe(page, '[role="alertdialog"]');
    await dialog.getByLabel('Meuble qui reçoit les produits').selectOption({ label: 'Frigo' });
    await expect(dialog).toContainText('plateau « Non rangé » de Frigo');
    await dialog.getByRole('button', { name: 'Supprimer Frigo 2' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Meuble « Frigo 2 » supprimé' }),
    ).toBeVisible();

    const detail = await client.get<{
      stock: { locationName: string; lines: { shelfId: number | null; quantity: number }[] }[];
    }>(`/api/products/${created.id}`);
    expect(detail.stock).toEqual([
      expect.objectContaining({
        locationName: 'Frigo',
        lines: [expect.objectContaining({ shelfId: null, quantity: 2 })],
      }),
    ]);
    // The history stays readable after the deletion.
    await page.goto(`/produits/${created.id}`);
    await expect(page.getByText(/depuis Frigo 2, étagère 1/)).toBeVisible();
    await expect(page.getByText(/vers Frigo, non rangé/)).toBeVisible();
  });
}

test('accueil à 6 meubles : grille sur 2 colonnes, page qui défile, zéro violation axe à 360 px, clavier', async ({
  page,
}, testInfo) => {
  const tag = tagOf(testInfo.project.name);
  const baseURL = testInfo.project.use.baseURL!;
  const account = `six-${tag}`;
  await ensureAccountInOwnHousehold(baseURL, account, 'mot-de-passe-six', `Six meubles ${tag}`);
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, account, 'mot-de-passe-six');
  const client = await api(page, baseURL);
  const names = (await client.get<Place[]>('/api/locations')).map((p) => p.name);
  for (const extra of ['Frigo garage', 'Congélateur cave']) {
    if (!names.includes(extra)) {
      await client.post('/api/locations', {
        name: extra,
        kind: extra.startsWith('Frigo') ? 'fridge' : 'freezer',
      });
    }
  }
  await page.goto('/inventaire');
  await expect(page.getByRole('link', { name: /^Congélateur cave/ })).toBeVisible();
  await expect(page.getByRole('list').first().getByRole('listitem')).toHaveCount(7);
  await axe(page);

  // Keyboard: the button opens the sheet, Tab stays inside, Échap gives the focus back.
  const add = page.getByRole('button', { name: 'Ajouter un meuble' });
  await add.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Ajouter un meuble' });
  await expect(sheet.getByRole('radio', { name: 'Frigo' })).toBeFocused();
  await expect(sheet.getByLabel('Nom du meuble')).toHaveValue('Frigo 2');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(add).toBeFocused();
});

// The same product as the scan tests of each browser: households are isolated, so the same code
// scanned again in other households never meets those products.
const SCAN = {
  'chromium-mobile': { code: '3017620422003', name: 'Pâte à tartiner Nutella', word: 'nutella' },
  'webkit-mobile': { code: '5449000000996', name: 'Coca-Cola Original Taste', word: 'coca' },
} as const;

async function scanAndAdd(page: Page, code: string, name: string) {
  await page.goto('/');
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  // A card of Open Food Facts, not the product of another household: the category is proposed.
  await expect(sheet.getByText(/Catégorie proposée/)).toBeVisible();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}, Frigo` }),
  ).toBeVisible();
}

test('deux foyers : ce que l’un scanne et range, l’autre ne le voit nulle part, même hors ligne', async ({
  browser,
}, testInfo) => {
  const tag = tagOf(testInfo.project.name);
  const baseURL = testInfo.project.use.baseURL!;
  const { code, name, word } = SCAN[testInfo.project.name as keyof typeof SCAN];
  await ensureAccountInOwnHousehold(
    baseURL,
    `foyer-un-${tag}`,
    'mot-de-passe-un',
    `Premier ${tag}`,
  );
  await ensureAccountInOwnHousehold(
    baseURL,
    `foyer-deux-${tag}`,
    'mot-de-passe-deux',
    `Second ${tag}`,
  );

  // Household 1 scans the product and puts it in its fridge.
  const one = await browser.newContext({ baseURL });
  const pageOne = await one.newPage();
  await signIn(pageOne, `foyer-un-${tag}`, 'mot-de-passe-un');
  await scanAndAdd(pageOne, code, name);
  const [productOne] = (await (await pageOne.request.get(`/api/products?q=${word}`)).json()) as {
    id: number;
  }[];
  const fridgeOne = ((await (await pageOne.request.get('/api/locations')).json()) as Place[]).find(
    (p) => p.name === 'Frigo',
  )!;

  // Household 2 sees it nowhere: furniture, products, search, list, product page, history.
  const two = await browser.newContext({ baseURL });
  const pageTwo = await two.newPage();
  await signIn(pageTwo, `foyer-deux-${tag}`, 'mot-de-passe-deux');
  for (const path of [
    '/inventaire',
    `/produits/${productOne!.id}`,
    `/inventaire/${fridgeOne.id}`,
  ]) {
    await pageTwo.goto(path);
    await expect(pageTwo.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await pageTwo.waitForLoadState('networkidle');
    await expect(pageTwo.locator('body')).not.toContainText(name);
  }
  await pageTwo.goto('/inventaire');
  await expect(pageTwo.getByRole('link', { name: /^Frigo\s*\d+ articles?/ })).toContainText(
    '0 article',
  );
  await pageTwo.getByRole('button', { name: 'Liste', exact: true }).click();
  await pageTwo.waitForLoadState('networkidle');
  await expect(pageTwo.locator('body')).not.toContainText(name);
  expect(await (await pageTwo.request.get(`/api/products?q=${word}`)).json()).toEqual([]);
  expect((await pageTwo.request.get(`/api/products/${productOne!.id}`)).status()).toBe(404);
  expect((await pageTwo.request.get(`/api/products/${productOne!.id}/movements`)).status()).toBe(
    404,
  );

  // The same code in household 2: Open Food Facts again, a product and a stock line of its own.
  await scanAndAdd(pageTwo, code, name);
  const [productTwo] = (await (await pageTwo.request.get(`/api/products?q=${word}`)).json()) as {
    id: number;
  }[];
  expect(productTwo!.id).not.toBe(productOne!.id);
  const fridgeTwo = ((await (await pageTwo.request.get('/api/locations')).json()) as Place[]).find(
    (p) => p.name === 'Frigo',
  )!;
  expect(fridgeTwo.id).not.toBe(fridgeOne.id);
  // Removing one unit in household 2 changes nothing in household 1.
  const removed = await pageTwo.request.post('/api/stock/remove', {
    headers: { Origin: baseURL },
    data: { productId: productTwo!.id },
  });
  expect(removed.ok()).toBe(true);
  // Read from the page of household 1 (its idle API connection may have been closed meanwhile).
  const stockOne = (await pageOne.evaluate(
    async (id) => (await fetch(`/api/products/${id}`)).json(),
    productOne!.id,
  )) as { stock: { quantity: number }[] };
  expect(stockOne.stock.map((s) => s.quantity)).toEqual([1]);

  // Offline afterwards: nothing of the inventory is kept on the device, let alone the other's.
  await two.setOffline(true);
  await pageTwo.reload().catch(() => undefined);
  await expect(pageTwo.locator('body')).not.toContainText(name);
  await two.setOffline(false);
  await one.close();
  await two.close();
});

test('console : l’admin crée « Foyer Dupont » et un compte dedans ; ce compte voit un inventaire vide et jamais le mot « foyer »', async ({
  page,
  browser,
}, testInfo) => {
  const tag = tagOf(testInfo.project.name);
  const baseURL = testInfo.project.use.baseURL!;
  const household = `Foyer Dupont ${tag.toUpperCase()}`;
  const account = `dupont-${tag}`;
  await signIn(page);
  await page.goto('/plus/administration/foyers');
  await expect(page.getByRole('heading', { level: 1, name: 'Foyers' })).toBeVisible();
  await page.getByLabel('Nom du nouveau foyer').fill(household);
  await page.getByRole('button', { name: 'Créer le foyer' }).click();
  const region = page.getByRole('region', { name: `Foyer ${household}` });
  await expect(region).toContainText('4 meubles');
  await expect(region).toContainText('Aucun compte.');

  await page.goto('/plus/administration/membres');
  await page.getByLabel('Pseudo du nouveau membre').fill(account);
  await page.getByLabel('Mot de passe temporaire').fill('temporaire-dupont');
  await page.getByLabel('Foyer', { exact: true }).selectOption({ label: household });
  await page.getByRole('button', { name: 'Créer le membre' }).click();
  await expect(page.getByRole('listitem', { name: account })).toContainText(`Foyer : ${household}`);

  const other = await browser.newContext({ baseURL });
  const member = await other.newPage();
  await signIn(member, account, 'temporaire-dupont');
  await member.goto('/inventaire');
  for (const name of ['Garde-manger', 'Frigo', 'Congélateur', 'Cave']) {
    await expect(
      member.getByRole('link', { name: new RegExp(`^${name}\\s*\\d+ articles?`) }),
    ).toContainText('0 article');
  }
  // The totals now live at the top of the list view (no banner over the furniture).
  await member.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(member.getByText('0 article · 0 unité')).toBeVisible();
  for (const path of [
    '/',
    '/inventaire',
    '/plus',
    '/plus/compte',
    '/plus/meubles',
    '/plus/administration',
  ]) {
    await member.goto(path);
    await expect(member.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await member.waitForLoadState('networkidle');
    await expect(member.locator('body')).not.toContainText(/foyer/i);
  }
  const me = await (await member.request.get('/api/auth/me')).json();
  expect(Object.keys(me).sort()).toEqual(['id', 'role', 'username']);
  expect(JSON.stringify(me)).not.toMatch(/household|foyer/i);
  await other.close();
});
