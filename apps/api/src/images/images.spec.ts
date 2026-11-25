import { readdir } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createUser,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { categories, products } from '../database/schema';
import { hasImageSignature, makeThumbnail } from './image.processor';

const jpeg = (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();

describe('makeThumbnail', () => {
  it('produces a WebP of 400 px width from a JPEG, PNG or WebP', async () => {
    const base = sharp({
      create: { width: 1000, height: 500, channels: 3, background: '#336699' },
    });
    for (const input of [
      await base.clone().jpeg().toBuffer(),
      await base.clone().png().toBuffer(),
      await base.clone().webp().toBuffer(),
    ]) {
      const meta = await sharp(await makeThumbnail(input)).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 400, height: 200 });
    }
  });

  it('does not enlarge a small image', async () => {
    const meta = await sharp(await makeThumbnail(await jpeg(100, 80))).metadata();
    expect(meta.width).toBe(100);
  });

  it('applies the EXIF orientation then drops all EXIF data', async () => {
    const input = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#336699' },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret' } } })
      .toBuffer();
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeDefined();
    const meta = await sharp(await makeThumbnail(input)).metadata();
    expect(meta.exif).toBeUndefined();
    // Rotated by 90 degrees: the 400 px wide landscape became a portrait.
    expect(meta).toMatchObject({ width: 400, height: 800 });
  });

  it('refuses text, an unknown format and a truncated image', async () => {
    await expect(makeThumbnail(Buffer.from('<?php echo 1; ?>'))).rejects.toThrow();
    const gif = Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex');
    await expect(makeThumbnail(gif)).rejects.toThrow();
    await expect(makeThumbnail((await jpeg()).subarray(0, 40))).rejects.toThrow();
  });

  it('recognises signatures', async () => {
    expect(hasImageSignature(await jpeg())).toBe(true);
    expect(hasImageSignature(Buffer.from('hello world, not an image'))).toBe(false);
    expect(hasImageSignature(Buffer.alloc(0))).toBe(false);
  });
});

let app: INestApplication;
let cookie: string;
let productId: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();

const upload = (id: number, buf: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') =>
  request(server())
    .post(`/api/products/${id}/image`)
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .attach('image', buf, { filename, contentType });

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetAll();
  await seedHousehold(app);
  await createUser(app, { username: 'membre', password: 'motdepasse1' });
  const login = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username: 'membre', password: 'motdepasse1' });
  cookie = `inv_session=${cookieValue(login, 'inv_session')}`;
  const [category] = await db().select().from(categories).limit(1);
  const [row] = await db()
    .insert(products)
    .values({ name: 'Lait', categoryId: category!.id, searchText: 'lait' })
    .returning({ id: products.id });
  productId = row!.id;
});

describe('POST /api/products/:id/image', () => {
  it('stores a thumbnail under a server-generated name, served back as a 400 px WebP', async () => {
    const res = await upload(productId, await jpeg(1200, 900), '../../evil.jpg');
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/api\/images\/[a-f0-9]{32}\.webp$/);

    const served = await request(server())
      .get(res.body.imageUrl)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    // Kept by the browser but asked again each time: the ownership check always runs.
    expect(served.headers['cache-control']).toBe('private, no-cache');
    expect(served.headers['etag']).toBeTruthy();
    const again = await request(server())
      .get(res.body.imageUrl)
      .set('Cookie', cookie)
      .set('If-None-Match', served.headers['etag'] as string);
    expect(again.status).toBe(304);
    expect(await sharp(served.body as Buffer).metadata()).toMatchObject({
      format: 'webp',
      width: 400,
      height: 300,
    });
  });

  it('replaces the previous image and deletes its file', async () => {
    const first = (await upload(productId, await jpeg())).body.imageUrl as string;
    const second = (await upload(productId, await jpeg())).body.imageUrl as string;
    expect(second).not.toBe(first);
    expect((await request(server()).get(first).set('Cookie', cookie)).status).toBe(404);
    expect((await request(server()).get(second).set('Cookie', cookie)).status).toBe(200);
    const [row] = await db().select().from(products).where(eq(products.id, productId));
    expect(`/api/images/${row!.imagePath}`).toBe(second);
  });

  it('answers 413 above 8 MB and keeps the product unchanged', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    expect((await upload(productId, big)).status).toBe(413);
    const [row] = await db().select().from(products).where(eq(products.id, productId));
    expect(row!.imagePath).toBeNull();
  });

  it('answers 415 for a fake JPEG, a GIF and a corrupt image, whatever the declared type', async () => {
    expect((await upload(productId, Buffer.from('not an image at all'))).status).toBe(415);
    const gif = Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex');
    expect((await upload(productId, gif, 'a.jpg', 'image/jpeg')).status).toBe(415);
    expect((await upload(productId, (await jpeg()).subarray(0, 40))).status).toBe(415);
    const [row] = await db().select().from(products).where(eq(products.id, productId));
    expect(row!.imagePath).toBeNull();
  });

  it('answers 404 for an unknown product without leaving a file behind', async () => {
    const dir = process.env['IMAGES_DIR']!;
    const before = await readdir(dir).catch(() => []);
    expect((await upload(99999, await jpeg())).status).toBe(404);
    expect(await readdir(dir).catch(() => [])).toEqual(before);
  });

  it('answers 400 without a file and 401 without a session', async () => {
    expect(
      (
        await request(server())
          .post(`/api/products/${productId}/image`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
      ).status,
    ).toBe(400);
    const anon = await request(server())
      .post(`/api/products/${productId}/image`)
      .set('Origin', ORIGIN)
      .attach('image', await jpeg(), 'a.jpg');
    expect(anon.status).toBe(401);
  });
});

describe('GET /api/images/:file', () => {
  it('refuses path traversal and unknown names with 404', async () => {
    for (const name of [
      '..%2F..%2Fetc%2Fpasswd',
      '..%2F..%2F..%2F..%2Fetc%2Fpasswd',
      'passwd',
      `${'a'.repeat(32)}.webp`,
      `${'A'.repeat(32)}.webp`,
      '%2e%2e',
      'x.webp',
    ]) {
      expect(
        (await request(server()).get(`/api/images/${name}`).set('Cookie', cookie)).status,
      ).toBe(404);
    }
  });

  it('requires a session', async () => {
    const res = await upload(productId, await jpeg());
    expect((await request(server()).get(res.body.imageUrl)).status).toBe(401);
  });
});
