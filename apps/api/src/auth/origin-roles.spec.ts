import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import { count, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, ownerDb, resetAuth } from '../../test/helpers';
import { sessions, users } from '../database/schema';
import { PasswordService } from './password.service';
import { Roles } from './roles.decorator';
import { SessionService } from './session.service';

@Controller('test-admin')
class TestAdminController {
  @Get()
  @Roles('admin')
  read(): { ok: true } {
    return { ok: true };
  }

  @Post()
  write(): { ok: true } {
    return { ok: true };
  }
}

let app: INestApplication;
const server = () => app.getHttpServer();

async function loginAs(username: string, password = 'motdepasse1'): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password });
  expect(res.status).toBe(200);
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}

beforeAll(async () => {
  app = await createTestApp({ controllers: [TestAdminController] });
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetAuth();
  await createUser(app, { username: 'root', password: 'motdepasse1', role: 'admin' });
  await createUser(app, { username: 'membre', password: 'motdepasse1', role: 'member' });
});

describe('origin guard', () => {
  it('refuses a POST without an Origin header', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ username: 'root', password: 'motdepasse1' });
    expect(res.status).toBe(403);
  });

  it('refuses a POST, PATCH and DELETE from a foreign origin', async () => {
    const foreign = 'https://exemple.test';
    expect((await request(server()).post('/api/auth/logout').set('Origin', foreign)).status).toBe(
      403,
    );
    expect((await request(server()).patch('/api/x/1').set('Origin', foreign)).status).toBe(403);
    expect((await request(server()).delete('/api/x/1').set('Origin', foreign)).status).toBe(403);
  });

  it('refuses a look-alike origin', async () => {
    const res = await request(server())
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:3000.evil.test');
    expect(res.status).toBe(403);
  });

  it('accepts the public origin', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'root', password: 'motdepasse1' });
    expect(res.status).toBe(200);
  });

  it('does not check GET requests', async () => {
    expect((await request(server()).get('/api/health')).status).toBe(200);
  });
});

describe('roles guard', () => {
  it('lets the admin through and answers 404 to a member, like an unknown route', async () => {
    const admin = await loginAs('root');
    const member = await loginAs('membre');
    expect((await request(server()).get('/api/test-admin').set('Cookie', admin)).status).toBe(200);
    const refused = await request(server()).get('/api/test-admin').set('Cookie', member);
    const unknown = await request(server()).get('/api/route-inconnue').set('Cookie', member);
    expect(refused.status).toBe(404);
    expect(refused.body).toEqual(unknown.body);
  });

  it('answers 401 without a session before looking at the role', async () => {
    expect((await request(server()).get('/api/test-admin')).status).toBe(401);
  });

  it('leaves routes without @Roles open to members', async () => {
    const member = await loginAs('membre');
    const res = await request(server())
      .post('/api/test-admin')
      .set('Origin', ORIGIN)
      .set('Cookie', member);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/auth/password', () => {
  const change = (cookie: string, body: object) =>
    request(server())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(body);

  it('changes the password and revokes the other sessions', async () => {
    const here = await loginAs('membre');
    const otherDevice = await loginAs('membre');
    const res = await change(here, {
      currentPassword: 'motdepasse1',
      newPassword: 'nouveau-mdp-9',
    });
    expect(res.status).toBe(204);

    expect((await request(server()).get('/api/auth/me').set('Cookie', here)).status).toBe(200);
    expect((await request(server()).get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(
      401,
    );
  });

  it('refuses the old password at login and accepts the new one', async () => {
    const cookie = await loginAs('membre');
    await change(cookie, { currentPassword: 'motdepasse1', newPassword: 'nouveau-mdp-9' });
    const old = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'membre', password: 'motdepasse1' });
    expect(old.status).toBe(401);
    await loginAs('membre', 'nouveau-mdp-9');
  });

  it('answers 403 when the current password is wrong', async () => {
    const cookie = await loginAs('membre');
    const res = await change(cookie, { currentPassword: 'faux', newPassword: 'nouveau-mdp-9' });
    expect(res.status).toBe(403);
    await loginAs('membre');
  });

  it('counts a wrong current password as a failed login: 429 after 5', async () => {
    const cookie = await loginAs('membre');
    for (let i = 0; i < 5; i++) {
      expect(
        (await change(cookie, { currentPassword: `faux-${i}`, newPassword: 'nouveau-mdp-9' }))
          .status,
      ).toBe(403);
    }
    const blocked = await change(cookie, {
      currentPassword: 'motdepasse1',
      newPassword: 'nouveau-mdp-9',
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // The same pair is blocked at login too.
    const login = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'membre', password: 'motdepasse1' });
    expect(login.status).toBe(429);
  });

  it('forgets the failures once the current password is right', async () => {
    const cookie = await loginAs('membre');
    for (let i = 0; i < 4; i++) {
      await change(cookie, { currentPassword: `faux-${i}`, newPassword: 'nouveau-mdp-9' });
    }
    expect(
      (await change(cookie, { currentPassword: 'motdepasse1', newPassword: 'nouveau-mdp-9' }))
        .status,
    ).toBe(204);
    for (let i = 0; i < 4; i++) {
      await change(cookie, { currentPassword: `faux-${i}`, newPassword: 'autre-mdp-99' });
    }
    expect(
      (await change(cookie, { currentPassword: 'nouveau-mdp-9', newPassword: 'autre-mdp-99' }))
        .status,
    ).toBe(204);
  });

  it('answers 400 when the new password is too short or too long', async () => {
    const cookie = await loginAs('membre');
    expect(
      (await change(cookie, { currentPassword: 'motdepasse1', newPassword: 'court' })).status,
    ).toBe(400);
    expect(
      (await change(cookie, { currentPassword: 'motdepasse1', newPassword: 'x'.repeat(129) }))
        .status,
    ).toBe(400);
    expect((await change(cookie, { currentPassword: 'motdepasse1' })).status).toBe(400);
  });

  it('refuses a login whose password changed while it was being checked', async () => {
    const db = ownerDb();
    const passwords = app.get(PasswordService);
    const newHash = await passwords.hash('nouveau-mdp-9');
    const verify = passwords.verify.bind(passwords);
    // The password change completes between the argon2 check and the creation of the session.
    vi.spyOn(passwords, 'verify').mockImplementationOnce(async (hash, password) => {
      const ok = await verify(hash, password);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.username, 'membre'));
      return ok;
    });
    const res = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'membre', password: 'motdepasse1' });
    expect(res.status).toBe(401);
    const [row] = await db.select({ n: count() }).from(sessions);
    expect(row!.n).toBe(0);
  });

  it('changes nothing when revoking the other sessions fails', async () => {
    const here = await loginAs('membre');
    const otherDevice = await loginAs('membre');
    vi.spyOn(app.get(SessionService), 'deleteForUser').mockRejectedValueOnce(new Error('panne'));
    const res = await change(here, {
      currentPassword: 'motdepasse1',
      newPassword: 'nouveau-mdp-9',
    });
    expect(res.status).toBe(500);
    // Rolled back: the old password still works, the new one does not, the other device stays.
    expect((await request(server()).get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(
      200,
    );
    await loginAs('membre', 'motdepasse1');
    const withNew = await request(server())
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'membre', password: 'nouveau-mdp-9' });
    expect(withNew.status).toBe(401);
  });

  it('answers 401 without a session', async () => {
    const res = await request(server())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .send({ currentPassword: 'a', newPassword: 'bbbbbbbbbb' });
    expect(res.status).toBe(401);
  });
});
