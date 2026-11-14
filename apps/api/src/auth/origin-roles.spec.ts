import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import { cookieValue, createUser, ORIGIN, resetAuth } from '../../test/helpers';
import { Roles } from './roles.decorator';

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

beforeEach(async () => {
  await resetAuth(app);
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
  it('lets the admin through and refuses a member with 403', async () => {
    const admin = await loginAs('root');
    const member = await loginAs('membre');
    expect((await request(server()).get('/api/test-admin').set('Cookie', admin)).status).toBe(200);
    expect((await request(server()).get('/api/test-admin').set('Cookie', member)).status).toBe(403);
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

  it('answers 401 without a session', async () => {
    const res = await request(server())
      .post('/api/auth/password')
      .set('Origin', ORIGIN)
      .send({ currentPassword: 'a', newPassword: 'bbbbbbbbbb' });
    expect(res.status).toBe(401);
  });
});
