#!/usr/bin/env node
// Generates the PWA icons from apps/web/assets/icon.svg with sharp.
// Usage: npm run icons
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'apps/web/assets/icon.svg'), 'utf8');
const outDir = path.join(root, 'apps/web/public/icons');
mkdirSync(outDir, { recursive: true });

// Full-bleed square, used as is for Apple (iOS rounds the corners itself).
const square = Buffer.from(source);

// "any" icons: rounded corners on a transparent background.
const rounded = Buffer.from(
  source.replace(
    '<rect width="512" height="512" fill="#1800ad"/>',
    '<rect width="512" height="512" rx="112" fill="#1800ad"/>',
  ),
);

// Maskable: the motif sits inside the 80 % safe zone, the indigo background fills the square.
const maskable = Buffer.from(
  source.replace(
    '<g id="motif" transform="translate(0 30)">',
    '<g id="motif" transform="translate(51.2 75.2) scale(0.8)">',
  ),
);

const icons = [
  { file: 'icon-192.png', size: 192, svg: rounded },
  { file: 'icon-512.png', size: 512, svg: rounded },
  { file: 'icon-512-maskable.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: square },
];

for (const { file, size, svg } of icons) {
  await sharp(svg).resize(size, size).png().toFile(path.join(outDir, file));
  console.log(`icons : ${file} (${size} x ${size})`);
}

// iPhone startup images (portrait): the white of the light theme with the icon in the middle.
// The list is shared with the page (apps/web/lib/startup-images.json) that links them.
const sizes = JSON.parse(readFileSync(path.join(root, 'apps/web/lib/startup-images.json'), 'utf8'));
const splashDir = path.join(root, 'apps/web/public/splash');
mkdirSync(splashDir, { recursive: true });
for (const { width, height } of sizes) {
  const side = Math.round(width * 0.28);
  const logo = await sharp(rounded).resize(side, side).png().toBuffer();
  await sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(splashDir, `splash-${width}x${height}.png`));
  console.log(`icons : splash-${width}x${height}.png`);
}
