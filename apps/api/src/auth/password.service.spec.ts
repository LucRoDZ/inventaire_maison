import { describe, expect, it, vi } from 'vitest';
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

  it('computes the dummy hash once, at start-up', async () => {
    const fresh = new PasswordService();
    const hash = vi.spyOn(fresh, 'hash');
    await fresh.onModuleInit();
    expect(hash).toHaveBeenCalledOnce();
    await fresh.verifyDummy('anything');
    await fresh.verifyDummy('anything else');
    expect(hash).toHaveBeenCalledOnce();
  });

  it('runs the dummy check without throwing', async () => {
    await expect(service.verifyDummy('anything')).resolves.toBeUndefined();
  });
});
