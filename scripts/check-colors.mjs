#!/usr/bin/env node
// Fails when a colour is written by hand in the web app: hex, rgb()/hsl(), or a Tailwind palette class.
// Colours come from tokens.css only. Usage: node scripts/check-colors.mjs [dir...]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.next', 'public', 'test-results', 'coverage']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html']);
const PALETTES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITIES =
  'bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow|placeholder';

const RULES = [
  {
    name: 'couleur hexadécimale',
    regex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g,
  },
  { name: 'couleur rgb(), rgba(), hsl() ou hsla()', regex: /\b(?:rgba?|hsla?)\(/g },
  {
    name: 'classe de palette Tailwind hors tokens',
    regex: new RegExp(`\\b(?:${UTILITIES})-(?:(?:${PALETTES})-\\d{2,3}|black)\\b`, 'g'),
  },
];

function isSourceFile(file) {
  if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(file)) return false;
  return EXTENSIONS.has(path.extname(file));
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (isSourceFile(full)) yield full;
  }
}

export function findViolations(roots) {
  const violations = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const rule of RULES) {
            for (const match of line.matchAll(rule.regex)) {
              violations.push({ file, line: index + 1, text: match[0], rule: rule.name });
            }
          }
        });
    }
  }
  return violations;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  const roots = process.argv.slice(2);
  const violations = findViolations(roots.length > 0 ? roots : ['apps/web']);
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  ${v.rule} : ${v.text}`);
  }
  if (violations.length > 0) {
    console.error(
      `\n${violations.length} couleur(s) hors tokens. Utilisez les variables de tokens.css.`,
    );
    process.exit(1);
  }
  console.log('check-colors : aucune couleur en dur.');
}
