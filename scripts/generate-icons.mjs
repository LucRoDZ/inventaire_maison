#!/usr/bin/env node
// Generates every icon of the app from the validated sources in design/icon/ with sharp.
// The sources are never modified. Usage: npm run icons
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src = (name) => path.join(root, 'design/icon', `${name}.svg`);
const read = (name) => readFileSync(src(name));
const web = path.join(root, 'apps/web');
const iconsDir = path.join(web, 'public/icons/v3');
const splashDir = path.join(web, 'public/splash/v3');
const INDIGO = '#1800AD';
const WHITE = '#ffffff';
const SAFE_RADIUS = 0.4; // maskable safe zone: circle of 80 % of the diameter

// Remove the previous outputs (old unversioned files and the old source).
for (const dir of ['public/icons', 'public/splash']) {
  const full = path.join(web, dir);
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.png')) rmSync(path.join(full, entry.name));
  }
}
rmSync(path.join(web, 'assets/icon.svg'), { force: true });
rmSync(path.join(web, 'public/splash/v3'), { recursive: true, force: true });
mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

const render = (name, size) => sharp(read(name), { density: 72 }).resize(size, size).png();

// Largest distance from the centre of the light motif pixels, as a fraction of the size.
async function motifRadius(png, size) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 150) {
        max = Math.max(max, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2));
      }
    }
  }
  return max / size;
}

// Maskable: full indigo square; the drawing is shrunk at render time if it leaves the safe zone.
async function maskable(size) {
  const full = await render('fond_indigo', size).toBuffer();
  const radius = await motifRadius(full, size);
  const limit = SAFE_RADIUS * 0.97;
  if (radius <= limit) return full;
  const inner = Math.floor(size * (limit / radius));
  console.log(`icons : maskable ${size} reduced to ${Math.round((inner / size) * 100)} %`);
  const small = await render('fond_indigo', inner).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: INDIGO } })
    .composite([{ input: small, gravity: 'center' }])
    .png()
    .toBuffer();
}

// Monochrome: drop the background rectangle, keep the silhouette only (alpha is what counts).
function monochromeSvg() {
  const svg = read('monochrome').toString('utf8');
  const pattern = /<rect width="1024" height="1024" fill="#[0-9A-Fa-f]{6}"\/>/;
  if (!pattern.test(svg)) {
    throw new Error('generate-icons: background rectangle not found in monochrome.svg');
  }
  return Buffer.from(svg.replace(pattern, ''));
}

const write = async (file, buffer) => {
  await sharp(buffer).toFile(path.join(iconsDir, file));
  console.log(`icons : ${file}`);
};

for (const size of [192, 512]) {
  await write(`icon-${size}.png`, await render('principale', size).toBuffer());
  await write(`icon-${size}-maskable.png`, await maskable(size));
}
await write(
  'icon-monochrome-512.png',
  await sharp(monochromeSvg(), { density: 72 }).resize(512, 512).png().toBuffer(),
);
await write(
  'apple-touch-icon.png',
  await render('fond_indigo', 180).flatten({ background: INDIGO }).toBuffer(),
);
copyFileSync(src('principale'), path.join(iconsDir, 'icon.svg'));
console.log('icons : icon.svg');
await write('favicon-16.png', await render('simplifiee', 16).toBuffer());
await write('favicon-32.png', await render('simplifiee', 32).toBuffer());

// favicon.ico: ICONDIR + ICONDIRENTRY, each image stored as a PNG.
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // width
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}
const ico = encodeIco([
  { size: 16, data: await render('simplifiee', 16).toBuffer() },
  { size: 32, data: await render('simplifiee', 32).toBuffer() },
  { size: 48, data: await render('principale', 48).toBuffer() },
]);
writeFileSync(path.join(web, 'public/favicon.ico'), ico);
console.log('icons : favicon.ico');

// iPhone startup images (portrait): white of the app with the icon in the middle (28 % of width).
// The list is shared with the page (apps/web/lib/startup-images.json) that links them.
const sizes = JSON.parse(readFileSync(path.join(web, 'lib/startup-images.json'), 'utf8'));
for (const { width, height } of sizes) {
  const side = Math.round(width * 0.28);
  const logo = await render('principale', side).toBuffer();
  await sharp({ create: { width, height, channels: 3, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(splashDir, `splash-${width}x${height}.png`));
  console.log(`icons : splash-${width}x${height}.png`);
}
