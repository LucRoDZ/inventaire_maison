import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageStore } from './image-store.service';
import { isAllowedImageUrl, RemoteImageService } from './remote-image.service';

const GOOD_URL = 'https://images.openfoodfacts.org/images/products/301/front.jpg';

const store = { saveThumbnail: vi.fn(async () => 'a'.repeat(32) + '.webp') };
const service = new RemoteImageService(store as unknown as ImageStore);

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function png(): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.saveThumbnail.mockClear();
});

describe('isAllowedImageUrl', () => {
  it('accepts only HTTPS on *.openfoodfacts.org', () => {
    expect(isAllowedImageUrl(GOOD_URL)).toBe(true);
    expect(isAllowedImageUrl(GOOD_URL.replace('https', 'http'))).toBe(false);
    expect(isAllowedImageUrl('https://exemple.test/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://openfoodfacts.org.evil.test/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://evilopenfoodfacts.org/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('pas une url')).toBe(false);
  });
});

describe('RemoteImageService', () => {
  it('stores the thumbnail of a valid image', async () => {
    const data = await png();
    stubFetch(async () => new Response(data));
    expect(await service.download(1, GOOD_URL)).toMatch(/^[a-f0-9]{32}\.webp$/);
    expect(store.saveThumbnail).toHaveBeenCalledOnce();
  });

  it('never calls a disallowed URL', async () => {
    const mock = stubFetch(async () => new Response(await png()));
    expect(await service.download(1, 'https://exemple.test/x.jpg')).toBeNull();
    expect(await service.download(1, 'http://images.openfoodfacts.org/x.jpg')).toBeNull();
    expect(await service.download(1, null)).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });

  it('does not follow redirects', async () => {
    const mock = stubFetch(
      async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }),
    );
    expect(await service.download(1, GOOD_URL)).toBeNull();
    expect(mock).toHaveBeenCalledOnce();
    expect(mock.mock.calls[0]?.[1].redirect).toBe('manual');
  });

  it('refuses a file over 8 MB, declared or streamed', async () => {
    stubFetch(
      async () => new Response(await png(), { headers: { 'content-length': String(9 << 20) } }),
    );
    expect(await service.download(1, GOOD_URL)).toBeNull();
    stubFetch(async () => new Response(new Uint8Array(9 << 20)));
    expect(await service.download(1, GOOD_URL)).toBeNull();
    expect(store.saveThumbnail).not.toHaveBeenCalled();
  });

  it('returns null for non-image content, errors and timeouts', async () => {
    const real = new RemoteImageService({
      saveThumbnail: async () => {
        throw new Error('unsupported');
      },
    } as unknown as ImageStore);
    stubFetch(async () => new Response('<html></html>'));
    expect(await real.download(1, GOOD_URL)).toBeNull();
    stubFetch(async () => new Response('', { status: 500 }));
    expect(await service.download(1, GOOD_URL)).toBeNull();
    stubFetch(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    expect(await service.download(1, GOOD_URL)).toBeNull();
  });
});
