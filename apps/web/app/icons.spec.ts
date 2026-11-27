import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import startupImages from '../lib/startup-images.json';
import manifest from './manifest';

const publicDir = path.resolve(__dirname, '../public');
const file = (p: string) => path.join(publicDir, p);

async function pixels(p: string) {
  const { data, info } = await sharp(file(p)).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  return { data, width: info.width, height: info.height };
}

describe.each([192, 512])('maskable icon %i', (size) => {
  const name = `icons/v3/icon-${size}-maskable.png`;

  it('keeps the light motif inside the safe zone', async () => {
    const { data, width, height } = await pixels(name);
    let max = 0;
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Close to the lavender #eae7fb.
        if (Math.abs(data[i]! - 234) < 20 && Math.abs(data[i + 1]! - 231) < 20) {
          count++;
          max = Math.max(max, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
        }
      }
    }
    expect(count).toBeGreaterThan(100);
    expect(max).toBeLessThanOrEqual(0.4 * size);
  });

  it('has indigo corners', async () => {
    const { data, width, height } = await pixels(name);
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const) {
      const i = (y * width + x) * 4;
      expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([24, 0, 173, 255]);
    }
  });
});

describe('icon files', () => {
  it('exist for the manifest, the layout and the startup images', () => {
    const m = manifest();
    const layout = readFileSync(path.resolve(__dirname, 'layout.tsx'), 'utf8');
    const fromLayout = [...layout.matchAll(/'(\/(?:icons|favicon)[^']*)'/g)].map((x) => x[1]!);
    const fromManifest = [
      ...(m.icons ?? []).map((i) => i.src),
      ...(m.shortcuts ?? []).flatMap((s) => (s.icons ?? []).map((i) => i.src)),
    ];
    expect(fromLayout.length).toBeGreaterThanOrEqual(5);
    for (const src of [...fromManifest, ...fromLayout]) {
      expect(existsSync(file(src)), src).toBe(true);
    }
    for (const { width, height } of startupImages) {
      expect(existsSync(file(`splash/v3/splash-${width}x${height}.png`))).toBe(true);
    }
  });

  it('has an opaque 180 px apple-touch-icon', async () => {
    const { data, width, height } = await pixels('icons/v3/apple-touch-icon.png');
    expect([width, height]).toEqual([180, 180]);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('has a transparent monochrome icon with an opaque silhouette', async () => {
    const { data, width, height } = await pixels('icons/v3/icon-monochrome-512.png');
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const) {
      expect(data[(y * width + x) * 4 + 3]).toBe(0);
    }
    expect(data.some((_, i) => i % 4 === 3 && data[i] === 255)).toBe(true);
  });

  it('has a valid favicon.ico with 16, 32 and 48 px entries', () => {
    const ico = readFileSync(file('favicon.ico'));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    const sizes = [0, 1, 2].map((n) => ico.readUInt8(6 + 16 * n));
    expect(sizes).toEqual([16, 32, 48]);
    for (let n = 0; n < 3; n++) {
      const length = ico.readUInt32LE(6 + 16 * n + 8);
      const offset = ico.readUInt32LE(6 + 16 * n + 12);
      expect(ico.subarray(offset, offset + 4).toString('hex')).toBe('89504e47');
      expect(offset + length).toBeLessThanOrEqual(ico.length);
    }
  });
});
