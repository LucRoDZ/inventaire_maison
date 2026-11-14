import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, DAY, HOUR } from '../../test/helpers';
import { createTempDatabase, type TempDatabase } from '../../test/temp-database';
import { sessions, users } from '../database/schema';
import { SESSION_TTL_MS } from './auth.constants';
import { hashToken, SessionService } from './session.service';

let tmp: TempDatabase;
let clock: FakeClock;
let service: SessionService;
let userId: number;

beforeAll(async () => {
  tmp = await createTempDatabase();
});

afterAll(async () => {
  await tmp.drop();
});

beforeEach(async () => {
  await tmp.pool.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
  clock = new FakeClock();
  service = new SessionService(tmp.db, clock);
  const [user] = await tmp.db
    .insert(users)
    .values({ username: 'lucas', passwordHash: 'x' })
    .returning();
  userId = user!.id;
});

describe('SessionService', () => {
  it('stores only the hash of the token', async () => {
    const { token } = await service.create(userId, 'jest');
    const rows = await tmp.db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(hashToken(token));
    expect(rows[0]!.id).not.toBe(token);
  });

  it('expires after 30 days', async () => {
    const { expiresAt } = await service.create(userId, undefined);
    expect(expiresAt.getTime() - clock.now().getTime()).toBe(SESSION_TTL_MS);
  });

  it('validates a fresh session without renewing it', async () => {
    const { token } = await service.create(userId, undefined);
    clock.advance(2 * HOUR);
    const result = await service.validate(token);
    expect(result?.user.username).toBe('lucas');
    expect(result?.refreshedExpiresAt).toBeUndefined();
  });

  it('renews the session once it is older than 24 hours', async () => {
    const { token } = await service.create(userId, undefined);
    clock.advance(DAY + HOUR);
    const result = await service.validate(token);
    expect(result?.refreshedExpiresAt?.getTime()).toBe(clock.now().getTime() + SESSION_TTL_MS);
    // a second call right after does not renew again
    expect((await service.validate(token))?.refreshedExpiresAt).toBeUndefined();
  });

  it('deletes an expired session', async () => {
    const { token } = await service.create(userId, undefined);
    clock.advance(SESSION_TTL_MS + 1000);
    expect(await service.validate(token)).toBeNull();
    expect(await tmp.db.select().from(sessions)).toHaveLength(0);
  });

  it('refuses the session of a disabled user', async () => {
    const { token } = await service.create(userId, undefined);
    await tmp.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
    expect(await service.validate(token)).toBeNull();
  });

  it('revokes every session of a user except the one kept', async () => {
    const a = await service.create(userId, undefined);
    const b = await service.create(userId, undefined);
    await service.deleteForUser(userId, hashToken(a.token));
    expect(await service.validate(a.token)).not.toBeNull();
    expect(await service.validate(b.token)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await service.validate('nope')).toBeNull();
  });
});
