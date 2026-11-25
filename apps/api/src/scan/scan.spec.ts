import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
  HOUSEHOLD,
} from '../../test/helpers';
import { categories, offCategoryMap, products } from '../database/schema';
import { RemoteImageService } from '../images/remote-image.service';
import { OffClient, type OffResult } from '../off/off.client';
import { ScanService } from './scan.service';

const NUTELLA = '3017620422003';
const IMAGE_URL = 'https://images.openfoodfacts.org/images/products/301/front.jpg';

let app: INestApplication;
let cookie: string;
let mappedTag: { offTag: string; categoryId: number };
const server = () => app.getHttpServer();
const db = () => ownerDb();
const scan = (code: string) => request(server()).get(`/api/scan/${code}`).set('Cookie', cookie);

const found = (
  over: Partial<Extract<OffResult, { status: 'found' }>['product']> = {},
): OffResult => ({
  status: 'found',
  product: {
    name: 'Pâte à tartiner',
    brand: 'Ferrero',
    quantity: '400 g',
    imageUrl: IMAGE_URL,
    categoriesTags: [mappedTag.offTag],
    payload: { product_name: 'Pâte à tartiner' },
    ...over,
  },
});

let fetchProduct: MockInstance<OffClient['fetchProduct']>;
let download: MockInstance<RemoteImageService['download']>;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAll();
  await seedHousehold(app);
  await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(res, 'inv_session')}`;
  const [tag] = await db().select().from(offCategoryMap).limit(1);
  mappedTag = tag!;
  fetchProduct = vi.spyOn(app.get(OffClient), 'fetchProduct').mockResolvedValue(found());
  download = vi.spyOn(app.get(RemoteImageService), 'download').mockResolvedValue(null);
});

afterEach(() => vi.restoreAllMocks());

describe('GET /api/scan/:barcode', () => {
  it('requires a session', async () => {
    expect((await request(server()).get(`/api/scan/${NUTELLA}`)).status).toBe(401);
  });

  it('refuses a request started by another site and creates nothing', async () => {
    for (const site of ['cross-site', 'same-site']) {
      expect((await scan(NUTELLA).set('Sec-Fetch-Site', site)).status).toBe(403);
    }
    expect(fetchProduct).not.toHaveBeenCalled();
    fetchProduct.mockResolvedValue(found());
    expect((await scan(NUTELLA).set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
  });

  it('rejects an invalid code with 400 and no network call', async () => {
    for (const code of ['abc', '3017620422004', '123']) {
      expect((await scan(code)).status).toBe(400);
    }
    expect(fetchProduct).not.toHaveBeenCalled();
  });

  it('creates a suggested product from Open Food Facts, then knows it', async () => {
    const res = await scan(NUTELLA);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'suggested',
      product: {
        barcode: NUTELLA,
        name: 'Pâte à tartiner',
        brand: 'Ferrero',
        sizeLabel: '400 g',
        categoryId: mappedTag.categoryId,
        categoryGuessed: true,
        source: 'off',
      },
    });
    const [row] = await db().select().from(products).where(eq(products.barcode, NUTELLA));
    expect(row?.offPayload).toEqual({ product_name: 'Pâte à tartiner' });
    expect(row?.createdBy).toBeTruthy();

    const second = await scan(NUTELLA);
    expect(second.body).toMatchObject({
      status: 'known',
      product: { barcode: NUTELLA, stock: [] },
    });
    expect(fetchProduct).toHaveBeenCalledTimes(1);
  });

  it('catalogOnly never calls Open Food Facts nor creates a product', async () => {
    const res = await scan(`${NUTELLA}?catalogOnly=true`);
    expect(res.body).toEqual({ status: 'unknown', reason: 'not_found' });
    expect(fetchProduct).not.toHaveBeenCalled();
    expect(await db().select().from(products)).toHaveLength(0);

    await scan(NUTELLA); // creates it the normal way
    const known = await scan(`${NUTELLA}?catalogOnly=true`);
    expect(known.body).toMatchObject({ status: 'known', product: { barcode: NUTELLA } });
  });

  it('falls back to "Autre" when no tag is mapped', async () => {
    fetchProduct.mockResolvedValue(found({ categoriesTags: ['en:nothing'] }));
    const res = await scan(NUTELLA);
    const [other] = await db().select().from(categories).where(eq(categories.isFallback, true));
    expect(res.body.product.categoryId).toBe(other!.id);
  });

  it('downloads the image in the background and stores its path', async () => {
    download.mockResolvedValue('a'.repeat(32) + '.webp');
    const res = await scan(NUTELLA);
    await app.get(ScanService).idle();
    expect(download).toHaveBeenCalledWith(HOUSEHOLD, IMAGE_URL);
    const [row] = await db().select().from(products).where(eq(products.id, res.body.product.id));
    expect(row?.imagePath).toBe('a'.repeat(32) + '.webp');
  });

  it('keeps the product without image when the download fails', async () => {
    const res = await scan(NUTELLA);
    await app.get(ScanService).idle();
    expect(res.body.status).toBe('suggested');
    const [row] = await db().select().from(products).where(eq(products.id, res.body.product.id));
    expect(row?.imagePath).toBeNull();
  });

  it('answers unknown/poor_data with hints for a card without a name', async () => {
    fetchProduct.mockResolvedValue(found({ name: null }));
    const res = await scan(NUTELLA);
    expect(res.body).toEqual({
      status: 'unknown',
      reason: 'poor_data',
      hints: { brand: 'Ferrero', sizeLabel: '400 g', imageUrl: IMAGE_URL },
    });
    expect(await db().select().from(products)).toHaveLength(0);
  });

  it('answers unknown/not_found when Open Food Facts does not know the code', async () => {
    fetchProduct.mockResolvedValue({ status: 'not_found' });
    expect((await scan(NUTELLA)).body).toEqual({ status: 'unknown', reason: 'not_found' });
  });

  it('answers 200 unknown/off_unavailable when Open Food Facts is down', async () => {
    fetchProduct.mockResolvedValue({ status: 'unavailable' });
    const res = await scan(NUTELLA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'unknown', reason: 'off_unavailable' });
  });

  it('normalizes a UPC-A code to its EAN-13', async () => {
    const res = await scan('036000291452');
    expect(fetchProduct).toHaveBeenCalledWith('0036000291452');
    expect(res.body.product.barcode).toBe('0036000291452');
  });

  it('creates a single product for simultaneous scans of the same unknown code', async () => {
    fetchProduct.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return found();
    });
    const responses = await Promise.all([scan(NUTELLA), scan(NUTELLA), scan(NUTELLA)]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await db().select().from(products)).toHaveLength(1);
    expect(fetchProduct).toHaveBeenCalledTimes(1);
  });
});
