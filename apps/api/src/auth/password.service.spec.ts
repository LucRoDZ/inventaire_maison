import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies the right password', async () => {
    const hash = await service.hash('correct horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    expect(await service.verify(hash, 'correct horse')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('correct horse');
    expect(await service.verify(hash, 'battery staple')).toBe(false);
  });

  it('rejects a malformed hash without throwing', async () => {
    expect(await service.verify('not-a-hash', 'whatever')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await service.hash('same')).not.toBe(await service.hash('same'));
  });

  it('runs the dummy check without throwing', async () => {
    await expect(service.verifyDummy('anything')).resolves.toBeUndefined();
  });
});
