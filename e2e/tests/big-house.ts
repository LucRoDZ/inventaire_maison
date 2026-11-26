import { expect, request, type Page } from '@playwright/test';
import { ensureAccountInOwnHousehold, signIn } from './helpers';

/**
 * A full house for the screens that must stay readable with a lot inside: 8 pieces of furniture
 * (the 4 of the model and 4 more) and 60 products spread over them and over several categories.
 * Each browser project has its own account alone in its own household, built once per run
 * (idempotent): the tests read it, they never change it.
 */

export const BIG_TAG = { 'chromium-mobile': 'A', 'webkit-mobile': 'B' } as const;
export const BIG_FURNITURE = 8;
export const BIG_PRODUCTS = 60;
/** Word that only the products of the big house carry. */
export const BIG_WORD = 'Rutabaga';

const EXTRA = [
  { name: 'Buffet de la salle', kind: 'other' },
  { name: 'Réserve du garage', kind: 'pantry' },
  { name: 'Coffre du cellier', kind: 'freezer' },
  { name: 'Mini-frigo du bureau', kind: 'fridge' },
] as const;

export const bigAccount = (tag: string) => ({
  username: `grande-${tag.toLowerCase()}`,
  password: 'grande-maison-mdp',
  household: `Grande maison ${tag}`,
});

interface Place {
  id: number;
  name: string;
  shelves: { id: number }[];
}

/** Builds the big house of this browser if it is not there yet. */
export async function ensureBigHouse(baseURL: string, tag: string): Promise<void> {
  const account = bigAccount(tag);
  await ensureAccountInOwnHousehold(baseURL, account.username, account.password, account.household);
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const login = await api.post('/api/auth/login', {
      data: { username: account.username, password: account.password },
    });
    expect(login.ok()).toBe(true);
    let places = (await (await api.get('/api/locations')).json()) as Place[];
    for (const extra of EXTRA) {
      if (places.some((p) => p.name === extra.name)) continue;
      const created = await api.post('/api/locations', {
        data: { name: extra.name, kind: extra.kind, shelfCount: 3 },
      });
      expect(created.ok(), await created.text()).toBe(true);
    }
    places = (await (await api.get('/api/locations')).json()) as Place[];
    expect(places).toHaveLength(BIG_FURNITURE);

    const existing = (await (
      await api.get(`/api/products?q=${BIG_WORD}&limit=100`)
    ).json()) as unknown[];
    if (existing.length >= BIG_PRODUCTS) return;
    const categories = (await (await api.get('/api/categories')).json()) as { id: number }[];
    for (let n = existing.length; n < BIG_PRODUCTS; n++) {
      const product = await api.post('/api/products', {
        data: {
          name: `${BIG_WORD} ${String(n + 1).padStart(2, '0')}`,
          categoryId: categories[n % categories.length]!.id,
        },
      });
      expect(product.ok(), await product.text()).toBe(true);
      const { id: productId } = (await product.json()) as { id: number };
      const place = places[n % places.length]!;
      const shelf = place.shelves[n % (place.shelves.length + 1)];
      const adjusted = await api.post('/api/stock/adjust', {
        data: {
          productId,
          locationId: place.id,
          shelfId: shelf?.id ?? null,
          delta: (n % 3) + 1,
          reason: 'manual',
        },
      });
      expect(adjusted.ok(), await adjusted.text()).toBe(true);
    }
  } finally {
    await api.dispose();
  }
}

/** Signs in with the account of the big house of this browser. */
export async function signInBigHouse(page: Page, tag: string): Promise<void> {
  const account = bigAccount(tag);
  await signIn(page, account.username, account.password);
}
