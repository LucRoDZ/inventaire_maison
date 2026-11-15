import { expect, test } from '@playwright/test';
import { pushCode, signIn, startScanner } from './helpers';

// Both browser projects share one database: each one scans its own product.
const FIXTURES = {
  'chromium-mobile': { code: '3017620422003', name: 'Pâte à tartiner Nutella', search: 'nutella' },
  'webkit-mobile': { code: '5449000000996', name: 'Coca-Cola Original Taste', search: 'coca' },
} as const;

test('scan simulé d’un produit Open Food Facts, ajout, second scan reconnu, saisie manuelle', async ({
  page,
}, testInfo) => {
  const { code, name, search } = FIXTURES[testInfo.project.name as keyof typeof FIXTURES];
  await signIn(page);
  await startScanner(page);

  // First scan: Open Food Facts answers, the product is created with a proposed category.
  await pushCode(page, code);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  const proposed = sheet.getByLabel('Catégorie proposée');
  await expect(proposed).toBeVisible();

  // Confirming the category from the sheet, then adding two units to the fridge.
  await proposed.selectOption({ index: 1 });
  await expect(sheet.getByLabel('Catégorie proposée')).toHaveCount(0);
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByRole('button', { name: 'Ajouter et scanner le suivant' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Ajouté : 2 × ${name}, Frigo` }),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);

  // The stock holds the product.
  const stock = await page.request.get(`/api/stock?q=${search}`);
  const body = (await stock.json()) as {
    items: { quantity: number; location: { name: string } }[];
  };
  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({ quantity: 2, location: { name: 'Frigo' } });

  // Second scan, same code: the camera is still on, the product is known (no new product).
  await pushCode(page, code);
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await expect(sheet.getByLabel('Catégorie proposée')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Fermer' }).click();
  await expect(sheet).toHaveCount(0);

  // Typed code: the same product again.
  await page.getByLabel('Code-barres').fill(code);
  await page.getByLabel('Code-barres').press('Enter');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await sheet.getByRole('button', { name: 'Fermer' }).click();

  const products = await page.request.get(`/api/products?q=${search}`);
  expect(((await products.json()) as unknown[]).length).toBe(1);
});
