import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.next', 'public', 'coverage', '.vitest']);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(tsx?|css|mjs)$/.test(entry)) yield full;
  }
}

describe('identity: no emoji', () => {
  it('has no emoji character in the web sources', () => {
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      // Keycap digits and the like are not pictographs; \p{Extended_Pictographic} is.
      if (/\p{Extended_Pictographic}/u.test(readFileSync(file, 'utf8'))) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
