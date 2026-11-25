import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DAY, FakeClock, HOUR } from '../../test/helpers';
import { createTempDatabase, type TempDatabase } from '../../test/temp-database';
import { sessions, users } from '../database/schema';
import { SESSION_TTL_MS } from './auth.constants';
import { sessionId, SessionService } from './session.service';

const SECRET = 'a-session-secret-of-at-least-32-chars';

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
  await tmp.pool.query('TRUNCATE sessions, users, households RESTART IDENTITY CASCADE');
  await tmp.pool.query("INSERT INTO households (name) VALUES ('Famille')");
  clock = new FakeClock();
  service = new SessionService(tmp.db, clock, { SESSION_SECRET: SECRET });
  const [user] = await tmp.db
    .insert(users)
    .values({ username: 'lucas', passwordHash: 'x', householdId: 1 })
    .returning();
  userId = user!.id;
});

describe('SessionService', () => {
  it('stores only the HMAC-SHA256 of the token, keyed with SESSION_SECRET', async () => {
    const { token } = await service.create(userId, 'jest');
    const rows = await tmp.db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(sessionId(SECRET, token));
    expect(rows[0]!.id).not.toBe(token);
    expect(rows[0]!.id).not.toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('revokes every session when SESSION_SECRET changes', async () => {
    const { token } = await service.create(userId, undefined);
    expect(await service.validate(token)).not.toBeNull();
    const rotated = new SessionService(tmp.db, clock, {
      SESSION_SECRET: 'another-secret-of-at-least-32-chars!',
    });
    expect(await rotated.validate(token)).toBeNull();
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
    await service.deleteForUser(userId, sessionId(SECRET, a.token));
    expect(await service.validate(a.token)).not.toBeNull();
    expect(await service.validate(b.token)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await service.validate('nope')).toBeNull();
  });
});
