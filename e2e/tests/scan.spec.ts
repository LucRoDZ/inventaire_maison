import { expect, test, type Page } from '@playwright/test';
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

// Codes with no fixture file (not found) and codes the fixture server answers with a 500 (outage).
const UNKNOWN = {
  'chromium-mobile': { code: '4006381333931', name: 'Moutarde de Dijon' },
  'webkit-mobile': { code: '7613003291103', name: 'Soupe de légumes' },
} as const;
const OUTAGE = {
  'chromium-mobile': { code: '5000112637922', name: 'Thé vert de Chine' },
  'webkit-mobile': { code: '3212345678906', name: 'Riz basmati' },
} as const;

async function describeAndAdd(page: Page, name: string) {
  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await form.getByLabel('Nom').fill(name);
  await form.getByLabel('Catégorie').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Enregistrer et ajouter' }).click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Garde-manger' });
  await sheet.getByRole('button', { name: 'Ajouter et scanner le suivant' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` })).toBeVisible();
}

test('code inconnu : formulaire, ajout, second scan reconnu', async ({ page }, testInfo) => {
  const { code, name } = UNKNOWN[testInfo.project.name as keyof typeof UNKNOWN];
  await signIn(page);
  await startScanner(page);

  await pushCode(page, code);
  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await expect(form.getByText('pas dans Open Food Facts')).toBeVisible();
  await expect(form.getByText(`Code-barres : ${code}`)).toBeVisible();
  await describeAndAdd(page, name);

  // Second scan: the product is now in the catalog, no form this time.
  await pushCode(page, code);
  await expect(page.getByRole('dialog', { name })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Nouveau produit' })).toHaveCount(0);
});

test('Open Food Facts en panne : formulaire vide et ajout possible', async ({ page }, testInfo) => {
  const { code, name } = OUTAGE[testInfo.project.name as keyof typeof OUTAGE];
  await signIn(page);
  await startScanner(page);

  await pushCode(page, code);
  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await expect(form.getByText('injoignable')).toBeVisible();
  await expect(form.getByLabel('Nom')).toHaveValue('');
  await describeAndAdd(page, name);

  const stock = await page.request.get(
    `/api/stock?q=${encodeURIComponent(name.split(' ')[0]!.toLowerCase())}`,
  );
  expect(((await stock.json()) as { items: unknown[] }).items).toHaveLength(1);
});

const BY_NAME = {
  'chromium-mobile': 'Tomates',
  'webkit-mobile': 'Poireaux',
} as const;

test('ajout manuel d’un produit sans code-barres', async ({ page }, testInfo) => {
  const name = BY_NAME[testInfo.project.name as keyof typeof BY_NAME];
  await signIn(page);

  await page.getByRole('button', { name: 'Ajouter sans code-barres' }).click();
  const search = page.getByRole('dialog', { name: 'Ajouter sans code-barres' });
  await search.getByLabel('Nom du produit').fill(name);
  await expect(search.getByText(`Aucun produit trouvé pour « ${name} »`)).toBeVisible();
  await search.getByRole('button', { name: 'Créer ce produit' }).click();

  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await expect(form.getByLabel('Nom')).toHaveValue(name);
  await expect(form.getByText(/Code-barres :/)).toHaveCount(0);
  await form.getByLabel('Catégorie').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Enregistrer et ajouter' }).click();

  const sheet = page.getByRole('dialog', { name });
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}, Frigo` }),
  ).toBeVisible();

  const products = (await (await page.request.get(`/api/products?q=${name}`)).json()) as {
    id: number;
    barcode: string | null;
  }[];
  expect(products).toHaveLength(1);
  expect(products[0]!.barcode).toBeNull();
  const history = (await (
    await page.request.get(`/api/products/${products[0]!.id}/movements`)
  ).json()) as {
    items: { reason: string; delta: number }[];
  };
  expect(history.items[0]).toMatchObject({ reason: 'manual', delta: 1 });
});

const REMOVAL = {
  'chromium-mobile': {
    code: '5412345678908',
    name: 'Lait demi-écrémé du retrait',
    search: 'lait demi',
  },
  'webkit-mobile': {
    code: '8009876543217',
    name: 'Jus d’orange du retrait',
    search: 'jus d',
  },
} as const;

test('mode Retirer : stock 2, deux retraits, l’article disparaît du stock', async ({
  page,
}, testInfo) => {
  const { code, name, search } = REMOVAL[testInfo.project.name as keyof typeof REMOVAL];
  const quantity = async () => {
    const body = (await (
      await page.request.get(`/api/stock?q=${encodeURIComponent(search)}`)
    ).json()) as {
      items: { quantity: number }[];
    };
    return body.items.reduce((sum, item) => sum + item.quantity, 0);
  };
  await signIn(page);
  await startScanner(page);

  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByRole('button', { name: 'Ajouter et scanner le suivant' }).click();
  await expect.poll(quantity).toBe(2);

  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  await pushCode(page, code);
  await expect(
    page.getByRole('status').filter({ hasText: `Retiré : 1 × ${name}, Frigo` }),
  ).toBeVisible();
  await expect.poll(quantity).toBe(1);

  await pushCode(page, code);
  await expect.poll(quantity).toBe(0);
  const left = (await (
    await page.request.get(`/api/stock?q=${encodeURIComponent(search)}`)
  ).json()) as {
    items: unknown[];
  };
  expect(left.items).toHaveLength(0);

  // A third read: known but no longer in stock.
  await pushCode(page, code);
  await expect(page.getByRole('alert').filter({ hasText: 'Pas en stock' })).toBeVisible();
});

const LISTED = {
  'chromium-mobile': {
    code: '3760001234565',
    name: 'Yaourt nature de l’inventaire',
    search: 'yaourt nature de',
  },
  'webkit-mobile': {
    code: '3760006543211',
    name: 'Fromage frais de l’inventaire',
    search: 'fromage frais de',
  },
} as const;

test('vue Liste : 3 unités au Frigo sous la bonne catégorie, modification de quantité', async ({
  page,
}, testInfo) => {
  const { code, name, search } = LISTED[testInfo.project.name as keyof typeof LISTED];
  const quantity = async () => {
    const body = (await (
      await page.request.get(`/api/stock?q=${encodeURIComponent(search)}`)
    ).json()) as {
      items: { quantity: number }[];
    };
    return body.items.reduce((sum, item) => sum + item.quantity, 0);
  };
  await signIn(page);
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByLabel('Étagère').selectOption({ label: 'Étagère 2' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect.poll(quantity).toBe(3);

  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Inventaire' })
    .click();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page.getByRole('tab', { name: /^Frigo/ }).click();
  const section = page.getByRole('button', { name: /^Produits laitiers et œufs/ });
  await expect(section).toBeVisible();
  const card = page.locator('article').filter({ hasText: name });
  await expect(card).toContainText('Frigo, Étagère 2');
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('3');

  await card.getByRole('button', { name: `Ajouter une unité de ${name}` }).click();
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('4');
  await expect.poll(quantity).toBe(4);
  await card.getByRole('button', { name: `Retirer une unité de ${name}` }).click();
  await card.getByRole('button', { name: `Retirer une unité de ${name}` }).click();
  await expect(card.getByLabel('Quantité', { exact: true })).toHaveText('2');
  await expect.poll(quantity).toBe(2);

  await page.reload();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page.getByRole('tab', { name: /^Frigo/ }).click();
  await expect(
    page.locator('article').filter({ hasText: name }).getByLabel('Quantité', { exact: true }),
  ).toHaveText('2');
});

test('vue Maison : quatre meubles nommés', async ({ page }) => {
  await signIn(page);
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Inventaire' })
    .click();
  await expect(page.getByRole('button', { name: 'Maison', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const name of ['Garde-manger', 'Frigo', 'Congélateur', 'Cave']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    await expect(page.getByRole('img', { name })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /^Frigo/ })).toContainText(/\d+ articles?/);
});

const SHELVES = {
  'chromium-mobile': { shelf: 'Étagère 3', product: 'Pommes Golden' },
  'webkit-mobile': { shelf: 'Étagère 4', product: 'Abricots secs' },
} as const;

// A 1 x 1 PNG: the server turns any picture into a WebP thumbnail.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('meuble ouvert : ajout depuis une étagère vide, le produit y apparaît avec sa photo', async ({
  page,
}, testInfo) => {
  const { shelf, product } = SHELVES[testInfo.project.name as keyof typeof SHELVES];
  await signIn(page);
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Inventaire' })
    .click();
  await page.getByRole('link', { name: /^Frigo/ }).click();
  await expect(page.getByRole('heading', { name: 'Frigo', level: 1 })).toBeVisible();
  const emptyShelf = page.getByRole('region', { name: shelf });
  await expect(emptyShelf.getByText('Vide')).toBeVisible();

  await emptyShelf.getByRole('link', { name: `Ajouter un produit sur ${shelf}` }).click();
  await expect(page).toHaveURL(/\/\?lieu=\d+&etagere=\d+$/);
  await page.getByRole('button', { name: 'Ajouter sans code-barres' }).click();
  await page.getByLabel('Nom du produit').fill(product);
  await page.getByRole('button', { name: 'Créer ce produit' }).click();
  const form = page.getByRole('dialog', { name: 'Nouveau produit' });
  await form.getByLabel('Catégorie').selectOption({ index: 1 });
  await form
    .getByLabel('Ajouter une photo')
    .setInputFiles({ name: 'fruit.png', mimeType: 'image/png', buffer: PNG });
  await form.getByRole('button', { name: 'Enregistrer et ajouter' }).click();

  // The sheet opens on the furniture and the shelf the scanner came from.
  const sheet = page.getByRole('dialog', { name: product });
  await expect(sheet.getByLabel('Lieu')).toHaveValue(/\d+/);
  await expect(sheet.getByLabel('Lieu').locator('option:checked')).toHaveText('Frigo');
  await expect(sheet.getByLabel('Étagère').locator('option:checked')).toHaveText(shelf);
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `Ajouté : 1 × ${product}, Frigo, ${shelf.toLowerCase()}` }),
  ).toBeVisible();

  await page.goto('/inventaire');
  await page.getByRole('link', { name: /^Frigo/ }).click();
  const filled = page.getByRole('region', { name: shelf });
  await expect(filled.getByText('Vide')).toHaveCount(0);
  const tile = filled.getByRole('button', { name: `${product}, quantité 1` });
  await expect(tile).toBeVisible();
  const photo = tile.locator('img');
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});

const MOVES = {
  'chromium-mobile': {
    code: '3760001111118',
    name: 'Beurre doux du déplacement',
    from: 'Balconnet',
    toLocation: 'Frigo',
    to: 'Bac à légumes 1',
  },
  'webkit-mobile': {
    code: '3760002222226',
    name: 'Confiture de fraises du déplacement',
    from: 'Bac à légumes 2',
    toLocation: 'Garde-manger',
    to: 'Étagère 1',
  },
} as const;

test('« Déplacer vers… » : d’une étagère à une autre par le menu', async ({ page }, testInfo) => {
  const { code, name, from, toLocation, to } = MOVES[testInfo.project.name as keyof typeof MOVES];
  await signIn(page);
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByLabel('Étagère').selectOption({ label: from });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` })).toBeVisible();

  await page.goto('/inventaire');
  await page.getByRole('link', { name: /^Frigo/ }).click();
  await page
    .getByRole('region', { name: from })
    .getByRole('button', { name: `${name}, quantité 1` })
    .click();
  const panel = page.getByRole('dialog', { name });
  await expect(panel.getByText(`Frigo, ${from}`)).toBeVisible();
  await panel.getByRole('button', { name: 'Déplacer vers…' }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`^Déplacer ${name}`) });
  await expect(dialog.getByRole('button', { name: 'Déplacer', exact: true })).toBeDisabled();
  await dialog.getByLabel('Meuble').selectOption({ label: toLocation });
  await dialog.getByLabel('Étagère').selectOption({ label: to });
  await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Déplacé : 1 × ${name} vers ${toLocation}` }),
  ).toBeVisible();

  if (toLocation === 'Frigo') {
    await expect(
      page.getByRole('region', { name: to }).getByRole('button', { name: `${name}, quantité 1` }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('region', { name: from }).getByRole('button', { name: `${name}, quantité 1` }),
  ).toHaveCount(0);

  const stock = (await (
    await page.request.get(`/api/stock?q=${encodeURIComponent(name.split(' ')[0]!.toLowerCase())}`)
  ).json()) as {
    items: {
      product: { name: string };
      location: { name: string };
      shelf: { name: string } | null;
    }[];
  };
  const line = stock.items.find((item) => item.product.name === name);
  expect(line?.location.name).toBe(toLocation);
  expect(line?.shelf?.name).toBe(to);
});
