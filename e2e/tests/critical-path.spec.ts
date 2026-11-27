import { expect, test } from '@playwright/test';
import {
  createMember,
  furnitureScenery,
  furnitureSettled,
  pushCode,
  signIn,
  openScanner,
  startScanner,
  filterListByFurniture,
} from './helpers';

// Both browser projects share one database: each one runs the path with its own products.
const PATH = {
  'chromium-mobile': {
    scanned: { code: '3760015555557', name: 'Beurre fermier salé' },
    manual: 'Radis rose croquant',
    member: 'lea',
  },
  'webkit-mobile': {
    scanned: { code: '3760016666665', name: 'Yaourt grec onctueux' },
    manual: 'Panais doré rôti',
    member: 'noe',
  },
} as const;

// Burst scan is on by default: this path opens the add sheet, so it is turned off here.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem('inventaire.scanner-settings.v1', JSON.stringify({ burst: false })),
  );
});

test('parcours critique : ajout, scan, quantité, vue Maison, déplacement, second membre', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const { scanned, manual, member } = PATH[testInfo.project.name as keyof typeof PATH];
  const stock = async (client: typeof page, q: string) =>
    (
      (await (await client.request.get(`/api/stock?q=${encodeURIComponent(q)}`)).json()) as {
        items: { quantity: number; location: { name: string } }[];
      }
    ).items;
  const quantity = async (q: string) =>
    (await stock(page, q)).reduce((sum, item) => sum + item.quantity, 0);

  // 1. Sign in.
  await signIn(page);
  await openScanner(page);

  // 2. Manual add, without barcode.
  await page.getByRole('button', { name: 'Ajouter sans code-barres' }).click();
  const search = page.getByRole('dialog', { name: 'Ajouter sans code-barres' });
  await search.getByLabel('Nom du produit').fill(manual);
  await search.getByRole('button', { name: /Créer «/ }).click();
  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await form.getByLabel('Catégorie').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Enregistrer et ajouter' }).click();
  const manualSheet = page.getByRole('dialog', { name: manual });
  await manualSheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await manualSheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${manual}` }),
  ).toBeVisible();

  // 3. Simulated scan of an Open Food Facts product: two units.
  await startScanner(page);
  await pushCode(page, scanned.code);
  const sheet = page.getByRole('dialog', { name: scanned.name });
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByLabel('Étagère').selectOption({ label: 'Étagère 1' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect.poll(() => quantity(scanned.name)).toBe(2);

  // 4. Quantity change from the list view.
  // Closing the full-screen scanner (no bottom bar there) leads to the inventory.
  await page.getByRole('button', { name: 'Fermer le scanner' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await filterListByFurniture(page, /^Frigo/);
  const card = page.locator('article').filter({ hasText: scanned.name });
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('2');
  await card.getByRole('button', { name: `Ajouter une unité de ${scanned.name}` }).click();
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('3');
  await expect.poll(() => quantity(scanned.name)).toBe(3);

  // 5. Home view: the fridge is closed on its card; entering it swings the door open, turns the
  // light on, and shows the product on its shelf.
  await page.getByRole('button', { name: 'Maison', exact: true }).click();
  const fridge = page.getByRole('link', { name: /^Frigo/ });
  await expect(fridge.locator('.fx-card-door')).toHaveCount(1);
  await fridge.click();
  await expect(page.getByRole('heading', { name: 'Frigo', level: 1 })).toBeVisible();
  const tile = page
    .getByRole('region', { name: 'Étagère 1' })
    .getByRole('button', { name: `${scanned.name}, quantité 3` });
  await expect(tile).toBeVisible();
  await furnitureSettled(page);
  const open = await furnitureScenery(page);
  expect(open.kind).toBe('fridge');
  // The door stands beside the shelves (never over them), its back showing; the light is on.
  expect(open.overlap).toHaveLength(1);
  expect(open.overlap[0]).toBeLessThanOrEqual(1);
  expect(open.back).toEqual([1]);
  // The thin light bar of the fridge, 0.6 at most.
  expect(open.light).toEqual([0.6]);
  // No « Ouvrir » or « Fermer » button: the way back is the « Maison » link.
  await expect(page.getByRole('button', { name: /^(ouvrir|fermer)$/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Maison' })).toBeVisible();

  // 6. Move the whole line to the pantry.
  await tile.click();
  const panel = page.getByRole('dialog', { name: scanned.name });
  await panel.getByRole('button', { name: 'Déplacer vers…' }).click();
  const move = page.getByRole('dialog', { name: new RegExp(`^Déplacer ${scanned.name}`) });
  await move.getByLabel('Meuble').selectOption({ label: 'Garde-manger' });
  await move.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Déplacé : 3 × ${scanned.name} vers Garde-manger` }),
  ).toBeVisible();
  await expect
    .poll(async () => (await stock(page, scanned.name))[0]?.location.name)
    .toBe('Garde-manger');

  // 7. A second member sees the same stock.
  await createMember(member, 'mot-de-passe-parcours');
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const memberPage = await other.newPage();
  await signIn(memberPage, member, 'mot-de-passe-parcours');
  const seen = await stock(memberPage, scanned.name);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ quantity: 3, location: { name: 'Garde-manger' } });
  await other.close();
});
