// Copies the ZXing WASM binary into apps/web/public/zxing so that it is served by the
// application itself (never from a CDN). Run before `next dev` and `next build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// `zxing-wasm/reader` resolves to dist/cjs/reader/index.js; the binary is in dist/reader.
const source = path.resolve(
  path.dirname(require.resolve('zxing-wasm/reader')),
  '../../reader/zxing_reader.wasm',
);
const target = path.resolve(import.meta.dirname, '../apps/web/public/zxing');
mkdirSync(target, { recursive: true });
copyFileSync(source, path.join(target, 'zxing_reader.wasm'));
console.log('zxing_reader.wasm copié dans apps/web/public/zxing');
