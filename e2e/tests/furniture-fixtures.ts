import { expect, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Furniture built for a test, straight in the e2e database (the API cannot create a furniture),
 * then stocked through the API. Each browser project builds its own (tag A or B): both share one
 * database. Product names use a word no other test searches for.
 */

export interface FurnitureSpec {
  name: string;
  kind: 'pantry' | 'fridge' | 'freezer' | 'cellar' | 'other';
  shelves: string[];
  /** Number of products on each shelf, by index (missing: none). */
  stock?: number[];
  /** Number of products in the « Non rangé » tray. */
  unshelved?: number;
}

export const TAG = { 'chromium-mobile': 'A', 'webkit-mobile': 'B' } as const;

export const renderFurniture = (tag: string): FurnitureSpec[] => [
  {
    name: `Glacière vide ${tag}`,
    kind: 'freezer',
    shelves: ['Tiroir 1', 'Tiroir 2', 'Tiroir 3'],
  },
  {
    name: `Glacière garnie ${tag}`,
    kind: 'freezer',
    shelves: ['Tiroir 1', 'Tiroir 2', 'Tiroir 3'],
    stock: [2],
  },
  {
    name: `Placard rempli ${tag}`,
    kind: 'pantry',
    shelves: ['Étagère 1', 'Étagère 2', 'Étagère 3', 'Étagère 4'],
    stock: [0, 6],
    unshelved: 1,
  },
  {
    name: `Réfrigérateur quatre ${tag}`,
    kind: 'fridge',
    shelves: ['Étagère 1', 'Étagère 2', 'Étagère 3', 'Bac à légumes'],
    stock: [1, 0, 2],
  },
  {
    name: `Buffet huit ${tag}`,
    kind: 'other',
    shelves: Array.from({ length: 8 }, (_, i) => `Rayon ${i + 1}`),
    stock: Array.from({ length: 8 }, () => 2),
    unshelved: 2,
  },
];

const databaseUrl = () =>
  process.env['E2E_DATABASE_URL'] ?? 'postgres://test:test@localhost:5432/inventaire_e2e';

interface Place {
  id: number;
  name: string;
  shelves: { id: number; name: string }[];
}

export async function places(page: Page): Promise<Place[]> {
  return (await (await page.request.get('/api/locations')).json()) as Place[];
}

/** Creates the furniture once (by name) and stocks it once. Returns its id. */
export async function ensureFurniture(
  page: Page,
  baseURL: string,
  spec: FurnitureSpec,
  word: string,
): Promise<number> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  let created = false;
  try {
    const found = await client.query<{ id: number }>('select id from locations where name = $1', [
      spec.name,
    ]);
    if (!found.rowCount) {
      const { rows } = await client.query<{ id: number }>(
        "insert into locations (name, kind, icon, sort_order) values ($1, $2, 'warehouse', 80) returning id",
        [spec.name, spec.kind],
      );
      for (const [i, shelf] of spec.shelves.entries()) {
        await client.query(
          'insert into shelves (location_id, name, kind, sort_order) values ($1, $2, $3, $4)',
          [rows[0]!.id, shelf, spec.kind === 'cellar' ? 'rack' : 'plain', i],
        );
      }
      created = true;
    }
  } finally {
    await client.end();
  }
  const place = (await places(page)).find((p) => p.name === spec.name)!;
  if (!created) return place.id;

  const headers = { Origin: baseURL };
  const categories = (await (await page.request.get('/api/categories')).json()) as {
    id: number;
    isFallback: boolean;
  }[];
  const categoryId = categories.find((c) => !c.isFallback)!.id;
  const slots: [number | null, number][] = [
    ...place.shelves.map((s, i): [number | null, number] => [s.id, spec.stock?.[i] ?? 0]),
    [null, spec.unshelved ?? 0],
  ];
  for (const [i, [shelfId, count]] of slots.entries()) {
    for (let n = 0; n < count; n++) {
      const product = await page.request.post('/api/products', {
        headers,
        data: { name: `${word} ${place.id}-${i}-${n}`, categoryId },
      });
      expect(product.ok()).toBe(true);
      const { id: productId } = (await product.json()) as { id: number };
      const adjusted = await page.request.post('/api/stock/adjust', {
        headers,
        data: { productId, locationId: place.id, shelfId, delta: n + 1, reason: 'manual' },
      });
      expect(adjusted.ok()).toBe(true);
    }
  }
  return place.id;
}
