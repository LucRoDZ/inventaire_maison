import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pushCode, signIn, startScanner } from '../tests/helpers';

const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
const dir = process.env['CAPTURE_DIR'] ?? path.join(__dirname, 'out');

async function shot(page: Page, name: string, width: number) {
  mkdirSync(dir, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, `${width}-${name}.png`) });
}

for (const size of SIZES) {
  test(`captures ${size.width}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await page.goto('/connexion');
    await shot(page, '01-connexion', size.width);
    await signIn(page);
    await shot(page, '02-scanner', size.width);
    await startScanner(page);
    await pushCode(page, '3760001234565');
    await expect(page.getByRole('dialog')).toBeVisible();
    await shot(page, '03-fiche-ajout', size.width);
    await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.goto('/inventaire');
    await shot(page, '04-accueil-maison', size.width);
    await page.getByRole('button', { name: 'Ajouter un meuble' }).click();
    await shot(page, '05-feuille-creation', size.width);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Liste', exact: true }).click();
    await shot(page, '06-accueil-liste', size.width);
    await page.goto('/inventaire');
    await page.getByRole('link', { name: /^Frigo\s*\d+ articles?/ }).click();
    await shot(page, '07-meuble-ouvert', size.width);
    const products = (await (await page.request.get('/api/products?q=yaourt')).json()) as {
      id: number;
    }[];
    if (products[0]) {
      await page.goto(`/produits/${products[0].id}`);
      await shot(page, '08-fiche-produit', size.width);
    }
    for (const [name, url] of [
      ['09-plus', '/plus'],
      ['10-compte', '/plus/compte'],
      ['11-meubles', '/plus/meubles'],
      ['13-administration', '/plus/administration'],
      ['14-foyers', '/plus/administration/foyers'],
      ['15-comptes', '/plus/administration/membres'],
      ['16-categories', '/plus/administration/categories'],
      ['17-correspondances', '/plus/administration/correspondances'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await shot(page, name, size.width);
      if (name === '11-meubles') {
        const cave = page.getByRole('listitem', { name: /^Meuble Cave/ });
        await cave.getByRole('button', { name: /^Cave/ }).click();
        await cave.getByRole('button', { name: 'Supprimer ce meuble' }).click();
        await shot(page, '12-boite-suppression', size.width);
        await page.keyboard.press('Escape');
      }
    }
    void testInfo;
  });
}
