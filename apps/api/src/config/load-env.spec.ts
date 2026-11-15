import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLocalEnv } from './load-env';

let root: string;
const KEYS = ['INV_LOAD_ENV_A', 'INV_LOAD_ENV_B'];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'load-env-'));
  writeFileSync(path.join(root, '.env'), 'INV_LOAD_ENV_A=from_file\nINV_LOAD_ENV_B=from_file\n');
  mkdirSync(path.join(root, 'apps', 'api', 'dist'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const key of KEYS) delete process.env[key];
});

describe('loadLocalEnv', () => {
  it('loads the root .env from a nested directory, without overriding set variables', () => {
    process.env['INV_LOAD_ENV_A'] = 'from_shell';
    const file = loadLocalEnv(path.join(root, 'apps', 'api', 'dist'), 'development');
    expect(file).toBe(path.join(root, '.env'));
    expect(process.env['INV_LOAD_ENV_A']).toBe('from_shell');
    expect(process.env['INV_LOAD_ENV_B']).toBe('from_file');
  });

  it('loads nothing in production or in tests', () => {
    expect(loadLocalEnv(root, 'production')).toBeNull();
    expect(loadLocalEnv(root, 'test')).toBeNull();
    expect(process.env['INV_LOAD_ENV_B']).toBeUndefined();
  });

  it('returns null when there is no .env', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'load-env-empty-'));
    try {
      expect(loadLocalEnv(path.join(empty), 'development')).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
