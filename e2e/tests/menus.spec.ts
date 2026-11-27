import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, settleAnimations, signIn } from './helpers';

// The « ⋯ » menu of a piece of furniture, from its card of the house and from the header of the
// open furniture: rename, icon, order, delete with its stock moved. Each browser works in a
// household of its own, so that its changes never reach another test.

test.use({ viewport: { width: 360, height: 740 } });

const TAG = { 'chromium-mobile': 'a', 'webkit-mobile': 'b' } as const;

async function axe(page: Page) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

const cardNames = (page: Page) =>
  page
    .getByRole('region', { name: 'Liste des meubles' })
    .locator('a.fx-card > .text-card-title')
    .allTextContents();

test('menu des meubles : renommer, icône, ordre, suppression avec transfert, focus rendu', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = TAG[testInfo.project.name as keyof typeof TAG];
  const account = `menus-${tag}`;
  await ensureAccountInOwnHousehold(baseURL!, account, 'menus-mot-de-passe', `Menus ${tag}`);
  await signIn(page, account, 'menus-mot-de-passe');

  // Something in the fridge, to delete it with its stock.
  const headers = { Origin: baseURL! };
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
  }[];
  const places = (await (await page.request.get('/api/locations')).json()) as {
    id: number;
    name: string;
  }[];
  const fridge = places.find((p) => p.name === 'Frigo')!;
  const product = await page.request.post('/api/products', {
    headers,
    data: { name: `Panais ${tag}`, categoryId: categories[0]!.id },
  });
  const { id: productId } = (await product.json()) as { id: number };
  await page.request.post('/api/stock/adjust', {
    headers,
    data: { productId, locationId: fridge.id, shelfId: null, delta: 2, reason: 'manual' },
  });

  await page.goto('/inventaire');
  await expect
    .poll(() => cardNames(page))
    .toEqual(['Garde-manger', 'Frigo', 'Congélateur', 'Cave']);

  // A tap on the card still opens the furniture.
  await page.getByRole('link', { name: /^Cave/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cave' })).toBeVisible();
  await page.goBack();

  // The menu of the card: 44 px, named after the furniture.
  const options = page.getByRole('button', { name: 'Options de Frigo' });
  const box = (await options.boundingBox())!;
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  await options.click();
  const menu = page.getByRole('dialog', { name: 'Frigo' });
  await expect(menu.getByRole('button', { name: 'Renommer' })).toBeVisible();
  await axe(page);

  // Rename: errors under the field, then Entrée.
  await menu.getByRole('button', { name: 'Renommer' }).click();
  const rename = page.getByRole('dialog', { name: 'Renommer Frigo' });
  const field = rename.getByLabel('Nom du meuble');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Frigo');
  await axe(page);
  await field.fill('');
  await field.press('Enter');
  await expect(rename.getByRole('alert')).toHaveText('Donnez un nom au meuble.');
  await field.fill('cave');
  await field.press('Enter');
  await expect(rename.getByRole('alert')).toContainText('déjà ce nom');
  await field.fill('Frigo cuisine');
  await field.press('Enter');
  await expect(rename).toHaveCount(0);
  const renamed = page.getByRole('button', { name: 'Options de Frigo cuisine' });
  await expect(renamed).toBeFocused();
  await expect(page.getByRole('link', { name: /^Frigo cuisine/ })).toBeVisible();

  // Icon: a grid of named radio buttons.
  await renamed.click();
  await page
    .getByRole('dialog', { name: 'Frigo cuisine' })
    .getByRole('button', { name: 'Changer l’icône' })
    .click();
  const icons = page.getByRole('dialog', { name: 'Icône de Frigo cuisine' });
  await expect(icons.locator('select')).toHaveCount(0);
  // A touch lands on the tile (the label), as a finger would.
  await icons.getByTitle('Flocon').click();
  await expect(icons.getByRole('radio', { name: 'Flocon' })).toBeChecked();
  await icons.getByRole('button', { name: 'Enregistrer l’icône' }).click();
  await expect(icons).toHaveCount(0);
  await expect(renamed).toBeFocused();
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/api/locations')).json()) as {
        name: string;
        icon: string;
      }[];
      return list.find((l) => l.name === 'Frigo cuisine')?.icon;
    })
    .toBe('snowflake');

  // Order: up, then down again.
  await renamed.click();
  await page
    .getByRole('dialog', { name: 'Frigo cuisine' })
    .getByRole('button', { name: 'Monter' })
    .click();
  await expect
    .poll(() => cardNames(page))
    .toEqual(['Frigo cuisine', 'Garde-manger', 'Congélateur', 'Cave']);
  await expect(renamed).toBeFocused();
  await renamed.click();
  await page
    .getByRole('dialog', { name: 'Frigo cuisine' })
    .getByRole('button', { name: 'Descendre' })
    .click();
  await expect
    .poll(() => cardNames(page))
    .toEqual(['Garde-manger', 'Frigo cuisine', 'Congélateur', 'Cave']);

  // Delete from the header of the open furniture, its stock going to the cellar.
  await page.getByRole('link', { name: /^Frigo cuisine/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Frigo cuisine' })).toBeVisible();
  await page.getByRole('button', { name: 'Options de Frigo cuisine' }).click();
  await page
    .getByRole('dialog', { name: 'Frigo cuisine' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  const confirm = page.getByRole('alertdialog', { name: 'Supprimer Frigo cuisine ?' });
  await expect(confirm.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await axe(page);
  await confirm.getByRole('button', { name: 'Supprimer Frigo cuisine' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Choisissez le meuble');
  await confirm.getByLabel('Meuble qui reçoit les produits').selectOption({ label: 'Cave' });
  await confirm.getByRole('button', { name: 'Supprimer Frigo cuisine' }).click();
  await expect(page).toHaveURL(/\/inventaire$/);
  await expect.poll(() => cardNames(page)).toEqual(['Garde-manger', 'Congélateur', 'Cave']);
  await expect(page.getByRole('link', { name: /^Cave/ })).toContainText('1 article');
});
