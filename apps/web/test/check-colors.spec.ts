import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.resolve(__dirname, '../../../scripts/check-colors.mjs');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'check-colors-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(file: string, content: string) {
  writeFileSync(path.join(dir, file), content);
  return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
}

describe('check-colors', () => {
  it('passes on code that only uses tokens', () => {
    const result = run(
      'ok.tsx',
      `export const A = () => <p className="bg-indigo text-white" style={{ color: 'var(--indigo)' }} />;`,
    );
    expect(result.status).toBe(0);
  });

  it('fails on a hexadecimal colour', () => {
    const result = run('bad.css', '.x { color: #ff0000; }');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('#ff0000');
  });

  it('fails on a short hexadecimal colour', () => {
    expect(run('bad.css', '.x { color: #f00; }').status).toBe(1);
  });

  it('fails on rgb() and hsl()', () => {
    expect(run('a.tsx', `const c = 'rgb(255 0 0)';`).status).toBe(1);
    expect(run('b.tsx', `const c = 'rgba(0,0,0,.5)';`).status).toBe(1);
    expect(run('c.css', '.x { color: hsl(10 20% 30%); }').status).toBe(1);
  });

  it('fails on a Tailwind palette class', () => {
    const result = run('bad.tsx', `export const A = () => <p className="bg-red-500" />;`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bg-red-500');
    expect(run('c.tsx', `const c = 'text-black';`).status).toBe(1);
  });

  it('does not flag anchors or token classes', () => {
    expect(
      run('a.tsx', `const link = <a href="#contenu">x</a>; const c = 'bg-amber text-indigo-mid';`)
        .status,
    ).toBe(0);
  });

  it('skips a line marked check-colors:allow', () => {
    expect(run('m.ts', `export const c = '#1800ad'; // check-colors:allow`).status).toBe(0);
  });

  it('ignores node_modules and spec files', () => {
    mkdirSync(path.join(dir, 'node_modules'));
    writeFileSync(path.join(dir, 'node_modules', 'x.css'), '.x { color: #ff0000; }');
    writeFileSync(path.join(dir, 'x.spec.ts'), `const c = '#ff0000';`);
    const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });

  it('passes on the real web app', () => {
    const web = path.resolve(__dirname, '..');
    const result = spawnSync(process.execPath, [script, web], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
