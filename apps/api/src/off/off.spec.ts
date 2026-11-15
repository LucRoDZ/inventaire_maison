import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.schema';
import { OffClient } from './off.client';

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, '../../test/fixtures/off', name), 'utf8');
}

const config = { OFF_USER_AGENT: 'TestAgent/1.0', OFF_BASE_URL: 'http://off.test' } as AppConfig;

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('OffClient', () => {
  const client = new OffClient(config);

  it('maps a complete card', async () => {
    stubFetch(async () => new Response(fixture('complete.json')));
    const result = await client.fetchProduct('3017620422003');
    expect(result).toMatchObject({
      status: 'found',
      product: {
        name: 'Pâte à tartiner Nutella',
        brand: 'Ferrero',
        quantity: '400 g',
        imageUrl: expect.stringContaining('openfoodfacts.org'),
        categoriesTags: ['en:spreads', 'en:sweet-spreads', 'en:chocolate-spreads'],
      },
    });
  });

  it('falls back to product_name without a French name', async () => {
    stubFetch(async () => new Response(fixture('no-french-name.json')));
    const result = await client.fetchProduct('5449000000996');
    expect(result).toMatchObject({ status: 'found', product: { name: 'Coca-Cola' } });
  });

  it('returns a null name for a card without a name', async () => {
    stubFetch(async () => new Response(fixture('no-name.json')));
    const result = await client.fetchProduct('1234567890128');
    expect(result).toMatchObject({
      status: 'found',
      product: { name: null, brand: 'Marque inconnue', categoriesTags: [] },
    });
  });

  it('returns not_found on a 404 and on status 0', async () => {
    stubFetch(async () => new Response('{}', { status: 404 }));
    expect(await client.fetchProduct('0000000000000')).toEqual({ status: 'not_found' });
    stubFetch(async () => new Response(fixture('not-found.json')));
    expect(await client.fetchProduct('0000000000000')).toEqual({ status: 'not_found' });
  });

  it('returns unavailable on a timeout', async () => {
    stubFetch(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect(await client.fetchProduct('3017620422003')).toEqual({ status: 'unavailable' });
  });

  it('aborts the request after 4 seconds', async () => {
    const mock = stubFetch(async () => new Response(fixture('complete.json')));
    await client.fetchProduct('3017620422003');
    const signal = mock.mock.calls[0]?.[1].signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('returns unavailable on a network error, a 500 and invalid JSON', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await client.fetchProduct('3017620422003')).toEqual({ status: 'unavailable' });
    stubFetch(async () => new Response('oops', { status: 500 }));
    expect(await client.fetchProduct('3017620422003')).toEqual({ status: 'unavailable' });
    stubFetch(async () => new Response('<html>not json'));
    expect(await client.fetchProduct('3017620422003')).toEqual({ status: 'unavailable' });
  });

  it('sends the configured User-Agent to the right URL', async () => {
    const mock = stubFetch(async () => new Response(fixture('complete.json')));
    await client.fetchProduct('3017620422003');
    const [url, init] = mock.mock.calls[0] ?? [];
    expect(url).toBe('http://off.test/api/v2/product/3017620422003.json');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe('TestAgent/1.0');
  });

  it('uses the public Open Food Facts host by default', async () => {
    const mock = stubFetch(async () => new Response(fixture('complete.json')));
    await new OffClient({ OFF_USER_AGENT: 'x' } as AppConfig).fetchProduct('3017620422003');
    expect(mock.mock.calls[0]?.[0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\//);
  });
});
