import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';
import robots from './robots';

const publicDir = path.resolve(__dirname, '../public');

describe('manifest', () => {
  const m = manifest();

  it('matches the specification', () => {
    expect(m).toMatchObject({
      name: 'Inventaire maison',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'fr',
      theme_color: '#1800ad',
      background_color: '#ffffff',
    });
  });

  it('has a short name of 12 characters at most', () => {
    expect(m.short_name).toBe('Inventaire');
    expect(m.short_name!.length).toBeLessThanOrEqual(12);
  });

  it('declares 192, 512 and 512 maskable icons', () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ]);
  });

  it('points to icon files that exist with the declared size', async () => {
    for (const icon of m.icons ?? []) {
      const file = path.join(publicDir, icon.src);
      expect(existsSync(file)).toBe(true);
      const { width, height, format } = await sharp(file).metadata();
      expect(`${width}x${height}`).toBe(icon.sizes);
      expect(format).toBe('png');
    }
  });

  it('has the Scanner and Courses shortcuts', () => {
    expect((m.shortcuts ?? []).map((s) => [s.name, s.url])).toEqual([
      ['Scanner', '/scanner'],
      ['Courses', '/courses'],
    ]);
  });

  it('ships an iPhone startup image of the declared size for each link', async () => {
    const sizes = (await import('../lib/startup-images.json')).default;
    expect(sizes.length).toBeGreaterThanOrEqual(6);
    for (const { width, height } of sizes) {
      const meta = await sharp(
        path.join(publicDir, `splash/splash-${width}x${height}.png`),
      ).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
    }
  });

  it('ships a 180 px apple-touch-icon', async () => {
    const { width, height } = await sharp(
      path.join(publicDir, 'icons/apple-touch-icon.png'),
    ).metadata();
    expect([width, height]).toEqual([180, 180]);
  });
});

describe('robots', () => {
  it('forbids everything', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});
