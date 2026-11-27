import { expect, test, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, signIn } from './helpers';

const PASSWORD = 'shelf-focus-e2e-password';
const DAIRY = 'Produits laitiers et œufs';

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}
interface Category {
  id: number;
  name: string;
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));

/** An account alone in its household, signed in, with small API helpers. */
async function setup(
  page: Page,
  testInfo: { project: { name: string; use: { baseURL?: string } } },
) {
  const baseURL = testInfo.project.use.baseURL!;
  const tag = testInfo.project.name === 'webkit-mobile' ? 'w' : 'c';
  const user = `sf${tag}`;
  await ensureAccountInOwnHousehold(baseURL, user, PASSWORD, `Foyer ${user}`);
  await signIn(page, user, PASSWORD);
  const headers = { Origin: baseURL };
  const get = async <T>(path: string) => (await (await page.request.get(path)).json()) as T;
  const post = async <T>(path: string, data: unknown) => {
    const response = await page.request.post(path, { headers, data });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  };
  const places = await get<Place[]>('/api/locations');
  const categories = await get<Category[]>('/api/categories');
  return {
    place: (name: string) => places.find((p) => p.name === name)!,
    category: (name: string) => categories.find((c) => c.name === name)!,
    async seed(name: string, over: Record<string, unknown>) {
      const locationId = (over['locationId'] as number) ?? places[0]!.id;
      const { id: productId } = await post<{ id: number }>('/api/products', {
        name,
        categoryId: categories.find((c) => c.name === DAIRY)!.id,
        defaultLocationId: locationId,
      });
      await post('/api/stock/adjust', { delta: 1, reason: 'manual', productId, ...over });
    },
  };
}

test.describe('shelf focus, 360×740', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('opens a shelf of 20 products, scrolls inside, comes back to the furniture', async ({
    page,
  }, testInfo) => {
    const app = await setup(page, testInfo);
    const pantry = app.place('Garde-manger');
    const shelf = pantry.shelves[0]!;
    for (let i = 1; i <= 20; i += 1) {
      await app.seed(`Pot ${String(i).padStart(2, '0')}`, {
        locationId: pantry.id,
        shelfId: shelf.id,
        ...(i === 1 ? { expiryDate: inDays(-2) } : {}),
      });
    }

    await page.goto(`/inventaire/${pantry.id}`);
    const furniture = page.getByRole('region', { name: /^Étagères de/ });
    await expect(furniture).toBeVisible();
    const before = await furniture.evaluate((node) => node.scrollTop);

    await page.getByRole('link', { name: `Ouvrir l’${shelf.name.toLowerCase()}` }).click();
    await expect(page).toHaveURL(new RegExp(`/etagere/${shelf.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Garde-manger');
    const zone = page.getByRole('region', { name: /^Produits/ });
    await expect(zone.getByRole('button')).toHaveCount(20);
    await expect(zone.getByRole('button', { name: 'Pot 01, quantité 1, périmé' })).toBeVisible();

    const metrics = await zone.evaluate((node) => ({
      scrollW: node.scrollWidth,
      clientW: node.clientWidth,
      scrollH: node.scrollHeight,
      clientH: node.clientHeight,
    }));
    expect(metrics.scrollW).toBeLessThanOrEqual(metrics.clientW);
    expect(metrics.scrollH).toBeGreaterThan(metrics.clientH);
    await zone.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect(zone.getByRole('button', { name: /^Pot 20/ })).toBeInViewport();

    await page.getByRole('button', { name: 'Retour au meuble' }).click();
    await expect(page).toHaveURL(new RegExp(`/inventaire/${pantry.id}$`));
    await expect(furniture).toBeVisible();
    expect(await furniture.evaluate((node) => node.scrollTop)).toBe(before);
  });

  test('Maison: the Périmés counter lists the expired product with its red ring', async ({
    page,
  }, testInfo) => {
    const app = await setup(page, testInfo);
    const pantry = app.place('Garde-manger');
    await app.seed('Crème périmée', { locationId: pantry.id, expiryDate: inDays(-3) });
    await app.seed('Riz lointain', { locationId: pantry.id, expiryDate: inDays(90) });

    await page.goto('/inventaire');
    const counters = page.getByRole('region', { name: 'Résumé du stock' });
    await counters.getByRole('button', { name: /Périmés/ }).click();
    await expect(page).toHaveURL(/echeance=perime/);
    const zone = page.getByRole('region', { name: 'Liste des produits' });
    const row = zone.getByRole('article').filter({ hasText: 'Crème périmée' });
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/ring-alert/);
    await expect(zone.getByText('Riz lointain')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Liste des meubles' })).toHaveCount(0);

    await counters.getByRole('button', { name: /Périmés/ }).click();
    await expect(page.getByRole('region', { name: 'Liste des meubles' })).toBeVisible();
  });
});
