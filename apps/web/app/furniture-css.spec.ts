import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Everything the doors' stylesheet must never contain. */
const FORBIDDEN: [name: string, pattern: RegExp][] = [
  ['hexadecimal colour', /#[0-9a-f]{3,8}\b/i],
  ['rgb() or rgba()', /\brgba?\(/i],
  ['hsl() or hsla()', /\bhsla?\(/i],
  ['gradient', /gradient/i],
  ['looping animation', /\binfinite\b/i],
];

const violations = (css: string) =>
  FORBIDDEN.filter(([, pattern]) => pattern.test(css)).map(([name]) => name);

/** The declarations found between the braces of each `@keyframes` block. */
function keyframeProperties(css: string): string[] {
  const properties: string[] = [];
  for (const match of css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    for (const step of match[1]!.matchAll(/\{([^{}]*)\}/g)) {
      for (const declaration of step[1]!.split(';')) {
        const property = declaration.split(':')[0]!.trim();
        if (property) properties.push(property);
      }
    }
  }
  return properties;
}

describe('furniture.css', () => {
  const css = read('./furniture.css');
  const tokens = read('../../../tokens.css');

  it('has no hard-coded colour, no gradient and no looping animation', () => {
    expect(violations(css)).toEqual([]);
  });

  it('would catch each of them', () => {
    expect(violations('a { color: #1800ad; }')).toEqual(['hexadecimal colour']);
    expect(violations('a { color: #fff; }')).toEqual(['hexadecimal colour']);
    expect(violations('a { color: rgb(0 0 0); }')).toEqual(['rgb() or rgba()']);
    expect(violations('a { box-shadow: 0 0 2px rgba(0, 0, 0, 0.1); }')).toEqual([
      'rgb() or rgba()',
    ]);
    expect(violations('a { color: hsl(0 0% 0%); }')).toEqual(['hsl() or hsla()']);
    expect(violations('a { background: radial-gradient(var(--amber), transparent); }')).toEqual([
      'gradient',
    ]);
    expect(violations('a { animation: spin 1s linear infinite; }')).toEqual(['looping animation']);
  });

  it('takes every colour from tokens.css: each variable is a token or a local --fx- one', () => {
    const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(5);
    const unknown = [...used].filter((name) => !name.startsWith('--fx-') && !defined.has(name));
    // --i (rank of a drawer or pile card) and --n (number of shelves) are set by React.
    expect(unknown.filter((name) => name !== '--i' && name !== '--n')).toEqual([]);
  });

  it('animates transform and opacity only', () => {
    const animated = new Set(keyframeProperties(css));
    expect(animated.size).toBeGreaterThan(0);
    expect([...animated].filter((p) => p !== 'transform' && p !== 'opacity')).toEqual([]);
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(
      (m) => m[1]!.trim().split(/\s+/)[0],
    );
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.filter((p) => p !== 'transform' && p !== 'opacity')).toEqual([]);
  });

  it('never relies on an inherited perspective, preserve-3d or backface-visibility', () => {
    // WebKit does not render them the same way everywhere: the doors carry their own perspective().
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/\bperspective(-origin)?\s*:/);
    expect(rules).not.toMatch(/preserve-3d/);
    expect(rules).not.toMatch(/backface-visibility/);
    expect(rules).toMatch(/perspective\(var\(--fx-depth\)\)/);
  });

  it('opens the furniture at once under prefers-reduced-motion (no delay left)', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(reduced).toContain('.fx-door');
    expect(reduced).toContain('.fx-light');
    expect(reduced).toContain('animation-delay: 0s');
  });

  it('is imported by globals.css, after the tokens', () => {
    const globals = read('./globals.css');
    const tokensAt = globals.indexOf("@import '../../../tokens.css'");
    const furnitureAt = globals.indexOf("@import './furniture.css'");
    expect(tokensAt).toBeGreaterThan(-1);
    expect(furnitureAt).toBeGreaterThan(tokensAt);
  });
});
