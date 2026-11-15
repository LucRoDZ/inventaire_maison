import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'longenough',
};

describe('parseEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const config = parseEnv(valid);
    expect(config.PORT).toBe(3001);
    expect(config.OFF_USER_AGENT).toBeTruthy();
    expect(config.RATE_LIMIT_PER_MINUTE).toBe(300);
  });

  it('names a missing variable', () => {
    expect(() => parseEnv({ ...valid, ADMIN_USERNAME: undefined })).toThrow(/ADMIN_USERNAME/);
  });

  it('rejects a SESSION_SECRET shorter than 32 characters without printing it', () => {
    const secret = 'short-secret-value';
    try {
      parseEnv({ ...valid, SESSION_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as Error).message).toContain('SESSION_SECRET');
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('rejects an ADMIN_PASSWORD shorter than 8 characters without printing it', () => {
    try {
      parseEnv({ ...valid, ADMIN_PASSWORD: 'abc1234' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('ADMIN_PASSWORD');
      expect((error as Error).message).not.toContain('abc1234');
    }
  });

  it('lists every invalid variable once', () => {
    try {
      parseEnv({});
      expect.unreachable();
    } catch (error) {
      const names = (error as EnvError).variables;
      expect(names).toEqual(
        expect.arrayContaining([
          'DATABASE_URL',
          'SESSION_SECRET',
          'ADMIN_USERNAME',
          'ADMIN_PASSWORD',
        ]),
      );
    }
  });

  it('ignores OFF_BASE_URL in production only', () => {
    const env = { ...valid, OFF_BASE_URL: 'http://localhost:9999' };
    expect(parseEnv({ ...env, NODE_ENV: 'production' }).OFF_BASE_URL).toBeUndefined();
    expect(parseEnv({ ...env, NODE_ENV: 'test' }).OFF_BASE_URL).toBe('http://localhost:9999');
  });
});
