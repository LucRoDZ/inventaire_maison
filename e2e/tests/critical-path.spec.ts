import { expect, test } from '@playwright/test';
import { createMember, pushCode, signIn, startScanner } from './helpers';

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

test('parcours critique : ajout, scan, quantité, vue Maison, déplacement, second membre, retrait jusqu’à 0', async ({
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

  // 2. Manual add, without barcode.
  await page.getByRole('button', { name: 'Ajouter sans code-barres' }).click();
  const search = page.getByRole('dialog', { name: 'Ajouter sans code-barres' });
  await search.getByLabel('Nom du produit').fill(manual);
  await search.getByRole('button', { name: 'Créer ce produit' }).click();
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
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('link', { name: 'Inventaire' }).click();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page.getByRole('tab', { name: /^Frigo/ }).click();
  const card = page.locator('article').filter({ hasText: scanned.name });
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('2');
  await card.getByRole('button', { name: `Ajouter une unité de ${scanned.name}` }).click();
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('3');
  await expect.poll(() => quantity(scanned.name)).toBe(3);

  // 5. Home view: the fridge shows the product on its shelf.
  await page.getByRole('button', { name: 'Maison', exact: true }).click();
  await page.getByRole('link', { name: /^Frigo/ }).click();
  const tile = page
    .getByRole('region', { name: 'Étagère 1' })
    .getByRole('button', { name: `${scanned.name}, quantité 3` });
  await expect(tile).toBeVisible();

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

  // 8. Remove down to zero in Retirer mode.
  await nav.getByRole('link', { name: 'Scanner' }).click();
  await startScanner(page);
  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  for (const left of [2, 1, 0]) {
    await pushCode(page, scanned.code);
    await expect.poll(() => quantity(scanned.name)).toBe(left);
  }
  await pushCode(page, scanned.code);
  await expect(page.getByRole('alert').filter({ hasText: 'Pas en stock' })).toBeVisible();
  expect(await stock(page, scanned.name)).toHaveLength(0);
});
