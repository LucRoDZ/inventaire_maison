import { expect, test, type Page } from '@playwright/test';
import { createMember, pushCode, signIn, startScanner } from './helpers';

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

const DRAGS = {
  'chromium-mobile': {
    keyboard: {
      code: '3760003333334',
      name: 'Glace vanille du clavier',
      place: 'Congélateur',
      from: 'Tiroir 1',
      to: 'Tiroir 2',
    },
    mouse: {
      code: '3760004444442',
      name: 'Vin rouge de la souris',
      place: 'Cave',
      from: 'Rangée 1',
      to: 'Rangée 2',
    },
  },
  'webkit-mobile': {
    keyboard: {
      code: '3760005555550',
      name: 'Bière brune du clavier',
      place: 'Cave',
      from: 'Rangée 3',
      to: 'Rangée 2',
    },
  },
} as const;

type Drag = { code: string; name: string; place: string; from: string; to: string };

async function putOnShelf(page: Page, { code, name, place, from }: Drag) {
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByLabel('Lieu').selectOption({ label: place });
  await sheet.getByLabel('Étagère').selectOption({ label: from });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` })).toBeVisible();
  await page.goto('/inventaire');
  await page.getByRole('link', { name: new RegExp(`^${place}`) }).click();
  await expect(
    page.getByRole('region', { name: from }).getByRole('button', { name: `${name}, quantité 1` }),
  ).toBeVisible();
}

async function expectMoved(page: Page, { name, to, from }: Drag) {
  await expect(
    page.getByRole('region', { name: to }).getByRole('button', { name: `${name}, quantité 1` }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: from }).getByRole('button', { name: `${name}, quantité 1` }),
  ).toHaveCount(0);
  const products = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(name)}&limit=1`)
  ).json()) as { id: number }[];
  await expect
    .poll(async () => {
      const history = (await (
        await page.request.get(`/api/products/${products[0]!.id}/movements`)
      ).json()) as {
        items: { reason: string; delta: number }[];
      };
      return history.items
        .filter((item) => item.reason === 'move')
        .map((item) => item.delta)
        .sort();
    })
    .toEqual([-1, 1]);
}

test('glisser-déposer au clavier : Espace, flèche, Espace', async ({ page }, testInfo) => {
  const drag = DRAGS[testInfo.project.name as keyof typeof DRAGS].keyboard;
  await signIn(page);
  await putOnShelf(page, drag);

  const tile = page
    .getByRole('region', { name: drag.from })
    .getByRole('button', { name: `${drag.name}, quantité 1` });
  await tile.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('navigation', { name: 'Déposer dans un meuble' })).toBeVisible();
  const key = drag.from > drag.to ? 'ArrowUp' : 'ArrowDown';
  // dnd-kit measures the drop zones just after the drag starts: an arrow pressed in that instant
  // does nothing. Press again until the announcement names the destination (never after).
  const live = page.locator('[id^="DndLiveRegion"]');
  const destination = `au-dessus de : ${drag.place}, ${drag.to}`;
  await expect(async () => {
    if (!(await live.textContent())?.includes(destination)) await page.keyboard.press(key);
    await expect(live).toContainText(destination, { timeout: 500 });
  }).toPass({ timeout: 8000 });
  await page.keyboard.press('Space');
  await expectMoved(page, drag);
});

test('glisser-déposer à la souris', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Souris : Chromium uniquement');
  const drag = DRAGS['chromium-mobile'].mouse;
  void testInfo;
  await signIn(page);
  await putOnShelf(page, drag);

  const tile = page
    .getByRole('region', { name: drag.from })
    .getByRole('button', { name: `${drag.name}, quantité 1` });
  const target = page.getByRole('region', { name: drag.to });
  const from = (await tile.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expectMoved(page, drag);
});

const TWO_MEMBERS = {
  'chromium-mobile': {
    code: '3760006666668',
    name: 'Brioche des deux membres',
    member: 'marie',
  },
  'webkit-mobile': { code: '3760007777776', name: 'Poiré brut des deux membres', member: 'paul' },
} as const;

test('deux membres, même stock : l’historique nomme chacun, la catégorie modifiée se voit dans la Liste', async ({
  page,
  browser,
}, testInfo) => {
  const { code, name, member } = TWO_MEMBERS[testInfo.project.name as keyof typeof TWO_MEMBERS];
  await createMember(member, 'mot-de-passe-membre');

  // The admin adds two units to the fridge.
  await signIn(page);
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await sheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Ajouté : 2 × ${name}` })).toBeVisible();

  // The member, in another session, sees it as known and adds one more.
  const baseURL = testInfo.project.use.baseURL;
  const other = await browser.newContext({ baseURL });
  const memberPage = await other.newPage();
  await signIn(memberPage, member, 'mot-de-passe-membre');
  await startScanner(memberPage);
  await pushCode(memberPage, code);
  const memberSheet = memberPage.getByRole('dialog', { name });
  await memberSheet.getByLabel('Lieu').selectOption({ label: 'Frigo' });
  await memberSheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(
    memberPage.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` }),
  ).toBeVisible();
  await other.close();

  // The product page: one stock, one history that names both.
  const products = (await (
    await page.request.get(`/api/products?q=${encodeURIComponent(name)}&limit=1`)
  ).json()) as {
    id: number;
  }[];
  await page.goto(`/produits/${products[0]!.id}`);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByText('Frigo : 3 unités')).toBeVisible();
  await expect(page.getByText(/admin a ajouté 2 unités dans Frigo, non rangé/)).toBeVisible();
  await expect(
    page.getByText(new RegExp(`${member} a ajouté 1 unité dans Frigo, non rangé`)),
  ).toBeVisible();
  await expect(page.getByText(/Ajout par scan · /).first()).toBeVisible();

  // The category chosen here shows in the list view.
  const category = page.getByRole('combobox', { name: 'Catégorie', exact: true });
  await expect(category).toBeVisible();
  const options = await category.locator('option').allTextContents();
  const current = await category.evaluate(
    (el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? null,
  );
  const target = options.find((option) => option !== current && option !== 'Autre')!;
  await category.selectOption({ label: target });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Produit enregistré.')).toBeVisible();

  await page.goto('/inventaire');
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  const section = page.getByRole('button', { name: new RegExp(`^${target}`) });
  await expect(section).toBeVisible();
  await expect(page.locator('article').filter({ hasText: name }).first()).toBeVisible();
});

test('une fiche produit inconnue affiche « Produit introuvable »', async ({ page }) => {
  await signIn(page);
  await page.goto('/produits/99999999');
  await expect(page.getByRole('heading', { name: 'Produit introuvable' })).toBeVisible();
  await page.goto('/produits/abc');
  await expect(page.getByRole('heading', { name: 'Produit introuvable' })).toBeVisible();
});

const REVIEW = {
  'chromium-mobile': { code: '3760008888884', name: 'Fromage des classements' },
  'webkit-mobile': { code: '3760009999992', name: 'Pâtes des classements' },
} as const;

test('À classer : un produit scanné apparaît, est confirmé, disparaît', async ({
  page,
}, testInfo) => {
  const { code, name } = REVIEW[testInfo.project.name as keyof typeof REVIEW];
  await signIn(page);
  await startScanner(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByLabel('Lieu').selectOption({ label: 'Garde-manger' });
  await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Ajouté : 1 × ${name}` })).toBeVisible();

  await page.getByRole('link', { name: /À classer/ }).click();
  const card = page.getByRole('article', { name });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /^Confirmer/ }).click();
  await expect(card).toHaveCount(0);

  // Reloading: the product is confirmed for good.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'À classer', level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name })).toHaveCount(0);
});

const PASSWORD_CHANGE = { 'chromium-mobile': 'sophie', 'webkit-mobile': 'julien' } as const;

test('mot de passe : changement depuis Compte, puis reconnexion', async ({ page }, testInfo) => {
  const member = PASSWORD_CHANGE[testInfo.project.name as keyof typeof PASSWORD_CHANGE];
  await createMember(member, 'ancien-mot-de-passe');
  await signIn(page, member, 'ancien-mot-de-passe');

  await page.getByRole('navigation').getByRole('link', { name: 'Plus', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Compte' }).click();
  await expect(page.getByText(member, { exact: true })).toBeVisible();

  await page.getByLabel('Mot de passe actuel').fill('mauvais-mot-de-passe');
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('nouveau-mot-de-passe');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('nouveau-mot-de-passe');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Le mot de passe actuel est incorrect' }),
  ).toBeVisible();

  await page.getByLabel('Mot de passe actuel').fill('ancien-mot-de-passe');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mot de passe modifié' })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Plus', exact: true }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion/);

  // The old password no longer works, the new one does.
  await page.getByLabel('Pseudo').fill(member);
  await page.getByLabel('Mot de passe').fill('ancien-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Pseudo ou mot de passe incorrect' }),
  ).toBeVisible();
  await signIn(page, member, 'nouveau-mot-de-passe');
});

const MEMBER_ADMIN = { 'chromium-mobile': 'camille', 'webkit-mobile': 'hugo' } as const;

test('administration : l’admin crée un membre qui se connecte, puis le désactive', async ({
  page,
  browser,
}, testInfo) => {
  const member = MEMBER_ADMIN[testInfo.project.name as keyof typeof MEMBER_ADMIN];
  await signIn(page);
  await page.goto('/plus/administration/membres');
  await expect(page.getByRole('heading', { name: 'Membres', level: 1 })).toBeVisible();
  await page.getByLabel('Pseudo du nouveau membre').fill(member);
  await page.getByLabel('Mot de passe temporaire').fill('temporaire-1234');
  await page.getByRole('button', { name: 'Créer le membre' }).click();
  const row = page.getByRole('listitem', { name: member });
  await expect(row).toContainText('Membre · Actif');

  // The new member signs in, and a member cannot open the administration.
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const memberPage = await other.newPage();
  await signIn(memberPage, member, 'temporaire-1234');
  await memberPage.goto('/plus/administration/membres');
  await expect(memberPage.getByText('Accès réservé à l’administrateur').first()).toBeVisible();

  // The admin deactivates the account: the open session is cut and a new sign-in fails.
  await row.getByRole('button', { name: 'Désactiver' }).click();
  await row.getByRole('button', { name: 'Confirmer la désactivation' }).click();
  await expect(row).toContainText('Membre · Désactivé');
  await memberPage.goto('/connexion');
  await memberPage.getByLabel('Pseudo').fill(member);
  await memberPage.getByLabel('Mot de passe').fill('temporaire-1234');
  await memberPage.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    memberPage.getByRole('alert').filter({ hasText: 'Pseudo ou mot de passe incorrect' }),
  ).toBeVisible();
  await other.close();
});

const SHELF_ADMIN = {
  'chromium-mobile': { shelf: 'Étagère admin A', product: 'Olives admin A', code: '3760010000004' },
  'webkit-mobile': { shelf: 'Étagère admin B', product: 'Raisins admin B', code: '3760011111113' },
} as const;

test('administration : une étagère ajoutée apparaît dans la vue Maison ; supprimée, ses produits passent en Non rangé', async ({
  page,
}, testInfo) => {
  const { shelf, product } = SHELF_ADMIN[testInfo.project.name as keyof typeof SHELF_ADMIN];
  const origin = { Origin: testInfo.project.use.baseURL! };
  await signIn(page);
  await page.goto('/plus/administration/lieux');
  const cellar = page.getByRole('region', { name: 'Lieu Cave' });
  await expect(cellar).toBeVisible();

  await cellar.getByLabel('Nom de la nouvelle étagère').fill(shelf);
  await cellar.getByRole('button', { name: 'Ajouter l’étagère' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Étagère ajoutée.' })).toBeVisible();
  await expect(cellar.getByRole('listitem', { name: shelf })).toBeVisible();

  // The shelf shows in the open furniture.
  await page.goto('/inventaire');
  await page.getByRole('link', { name: /^Cave/ }).click();
  await expect(page.getByRole('region', { name: shelf })).toBeVisible();

  // Put a product on it through the API, then delete the shelf from the administration.
  const categories = (await (await page.request.get('/api/categories')).json()) as { id: number }[];
  const created = await page.request.post('/api/products', {
    headers: origin,
    data: { name: product, categoryId: categories[0]!.id },
  });
  const { id: productId } = (await created.json()) as { id: number };
  const places = (await (await page.request.get('/api/locations')).json()) as {
    id: number;
    name: string;
    shelves: { id: number; name: string }[];
  }[];
  const cave = places.find((l) => l.name === 'Cave')!;
  const shelfId = cave.shelves.find((s) => s.name === shelf)!.id;
  const adjust = await page.request.post('/api/stock/adjust', {
    headers: origin,
    data: {
      productId,
      locationId: cave.id,
      shelfId,
      delta: 2,
      reason: 'manual',
    },
  });
  expect(adjust.ok()).toBe(true);

  await page.goto('/plus/administration/lieux');
  const row = page
    .getByRole('region', { name: 'Lieu Cave' })
    .getByRole('listitem', { name: shelf });
  await row.getByRole('button', { name: 'Supprimer' }).click();
  await expect(row).toContainText('Les produits iront dans Non rangé.');
  await row.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Étagère supprimée.' })).toBeVisible();

  await page.goto('/inventaire');
  await page.getByRole('link', { name: /^Cave/ }).click();
  await expect(page.getByRole('region', { name: shelf })).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Non rangé' })
      .getByRole('button', { name: `${product}, quantité 2` }),
  ).toBeVisible();
});

const MAPPING = {
  'chromium-mobile': {
    tag: 'en:herbal-teas',
    code: '3760012222223',
    name: 'Tisane du classement admin',
  },
  'webkit-mobile': { tag: 'en:syrups', code: '3760013333331', name: 'Sirop du classement admin' },
} as const;

test('administration : une correspondance ajoutée classe un produit scanné ensuite', async ({
  page,
}, testInfo) => {
  const { tag, code, name } = MAPPING[testInfo.project.name as keyof typeof MAPPING];
  await signIn(page);
  await page.goto('/plus/administration/correspondances');

  // A tag nobody mapped yet: the same tag twice is reported.
  const form = page.getByRole('form', { name: 'Ajouter une correspondance' });
  await form.getByLabel('Nouveau tag Open Food Facts').fill(tag);
  await form.getByLabel('Catégorie du nouveau tag').selectOption({ label: 'Boissons' });
  await form.getByRole('button', { name: 'Ajouter la correspondance' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Correspondance ajoutée.' }),
  ).toBeVisible();
  await form.getByLabel('Nouveau tag Open Food Facts').fill(tag);
  await form.getByRole('button', { name: 'Ajouter la correspondance' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'déjà associé' })).toBeVisible();

  await startScannerFrom(page);
  await pushCode(page, code);
  const sheet = page.getByRole('dialog', { name });
  const proposed = sheet.getByLabel('Catégorie proposée');
  await expect(proposed).toBeVisible();
  await expect(proposed.locator('option:checked')).toHaveText('Boissons');
});

async function startScannerFrom(page: Page) {
  await page.goto('/');
  await startScanner(page);
}
