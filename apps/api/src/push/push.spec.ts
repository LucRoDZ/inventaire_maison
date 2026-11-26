import type { INestApplication } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import type { PushSummaryPayload } from '@inventaire/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/create-test-app';
import {
  cookieValue,
  createHousehold,
  createUser,
  FakeClock,
  HOUSEHOLD,
  ORIGIN,
  ownerDb,
  resetAll,
  seedHousehold,
} from '../../test/helpers';
import { parseEnv } from '../config/env.schema';
import {
  categories,
  locations,
  products,
  pushSubscriptions,
  settings,
  stockItems,
  users,
} from '../database/schema';
import { PushScheduler } from './push.scheduler';
import { PUSH_SENDER, WebPushSender, type PushSender, type PushTarget } from './push.sender';
import { buildSummary, PushService } from './push.service';

class FakeSender implements PushSender {
  enabled = true;
  publicKey: string | null = 'PUBLIC-KEY';
  gone = new Set<string>();
  sent: { endpoint: string; payload: PushSummaryPayload }[] = [];

  async send(target: PushTarget, payload: PushSummaryPayload) {
    if (this.gone.has(target.endpoint)) return 'gone' as const;
    this.sent.push({ endpoint: target.endpoint, payload });
    return 'sent' as const;
  }
}

// 12:00 in Paris on 2026-06-01.
const clock = new FakeClock(new Date('2026-06-01T10:00:00.000Z'));
const sender = new FakeSender();
let app: INestApplication;
let other: number;
const server = () => app.getHttpServer();
const db = () => ownerDb();
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-key' };
const url = (n: string) => `https://push.example.test/${n}`;

async function login(username: string): Promise<string> {
  const res = await request(server())
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password: 'motdepasse1' });
  return `inv_session=${cookieValue(res, 'inv_session')}`;
}
const as = (cookie: string) => ({
  get: (path: string) => request(server()).get(path).set('Cookie', cookie),
  post: (path: string) => request(server()).post(path).set('Cookie', cookie).set('Origin', ORIGIN),
  delete: (path: string) =>
    request(server()).delete(path).set('Cookie', cookie).set('Origin', ORIGIN),
});

async function stockLine(householdId: number, expiryDate: string | null) {
  const [cat] = await db()
    .select()
    .from(categories)
    .where(and(eq(categories.name, 'Autre'), eq(categories.householdId, householdId)));
  const [place] = await db()
    .select()
    .from(locations)
    .where(eq(locations.householdId, householdId))
    .orderBy(asc(locations.sortOrder));
  const [product] = await db()
    .insert(products)
    .values({ householdId, name: `P ${expiryDate}`, categoryId: cat!.id, searchText: 'p' })
    .returning();
  await db().insert(stockItems).values({
    householdId,
    productId: product!.id,
    locationId: place!.id,
    quantity: 1,
    expiryDate,
  });
}

async function subscribe(householdId: number, userId: number, endpoint: string) {
  await db()
    .insert(pushSubscriptions)
    .values({ householdId, userId, endpoint: url(endpoint), ...KEYS });
}
const endpoints = async () =>
  (await db().select().from(pushSubscriptions).orderBy(asc(pushSubscriptions.id))).map((s) =>
    s.endpoint.replace(url(''), ''),
  );

beforeAll(async () => {
  app = await createTestApp({ clock, overrides: [{ token: PUSH_SENDER, value: sender }] });
});
afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  sender.enabled = true;
  sender.gone.clear();
  sender.sent = [];
  await resetAll();
  await seedHousehold(app);
  other = await createHousehold(app, 'Autre foyer');
});

describe('Web Push routes', () => {
  let alice: string;
  let bob: string;

  beforeEach(async () => {
    await createUser(app, { username: 'alice', password: 'motdepasse1' });
    await createUser(app, { username: 'bob', password: 'motdepasse1' });
    alice = await login('alice');
    bob = await login('bob');
  });

  it('serves the public key, or null without VAPID keys', async () => {
    expect((await request(server()).get('/api/push/public-key')).status).toBe(401);
    expect((await as(alice).get('/api/push/public-key')).body).toEqual({ publicKey: 'PUBLIC-KEY' });
    const config = parseEnv(process.env);
    const real = new WebPushSender({ ...config, VAPID_PUBLIC_KEY: undefined });
    expect(real.enabled).toBe(false);
    expect(real.publicKey).toBeNull();
    const keyed = new WebPushSender({ ...config, VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' });
    expect(keyed.enabled).toBe(true);
    expect(keyed.publicKey).toBe('a');
  });

  it('upserts a subscription on household and endpoint', async () => {
    const body = { endpoint: url('1'), keys: KEYS };
    expect((await as(alice).post('/api/push/subscriptions').send(body)).status).toBe(204);
    expect(
      (
        await as(bob)
          .post('/api/push/subscriptions')
          .send({ ...body, keys: { p256dh: 'new', auth: 'new-auth' } })
      ).status,
    ).toBe(204);
    const rows = await db().select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ householdId: HOUSEHOLD, p256dh: 'new', auth: 'new-auth' });
    const [bobRow] = await db().select().from(users).where(eq(users.username, 'bob'));
    expect(rows[0]!.userId).toBe(bobRow!.id);
  });

  it('rejects an invalid subscription', async () => {
    for (const body of [
      {},
      { endpoint: 'not a url', keys: KEYS },
      { endpoint: url('1') },
      { endpoint: url('1'), keys: { p256dh: 'x' } },
    ]) {
      expect((await as(alice).post('/api/push/subscriptions').send(body)).status).toBe(400);
    }
    expect((await as(alice).delete('/api/push/subscriptions').send({})).status).toBe(400);
  });

  it('deletes only the subscription of the account', async () => {
    await as(alice)
      .post('/api/push/subscriptions')
      .send({ endpoint: url('a'), keys: KEYS });
    await as(bob)
      .post('/api/push/subscriptions')
      .send({ endpoint: url('b'), keys: KEYS });
    expect(
      (
        await as(bob)
          .delete('/api/push/subscriptions')
          .send({ endpoint: url('a') })
      ).status,
    ).toBe(204);
    expect(await endpoints()).toEqual(['a', 'b']);
    await as(alice)
      .delete('/api/push/subscriptions')
      .send({ endpoint: url('a') });
    expect(await endpoints()).toEqual(['b']);
  });

  it('never reaches the subscription of another household', async () => {
    const [carol] = [
      await createUser(app, { username: 'carol', password: 'motdepasse1', householdId: other }),
    ];
    await subscribe(other, carol, 'carol');
    await as(alice)
      .delete('/api/push/subscriptions')
      .send({ endpoint: url('carol') });
    expect(await endpoints()).toEqual(['carol']);
    // The same endpoint can exist in both households.
    await as(alice)
      .post('/api/push/subscriptions')
      .send({ endpoint: url('carol'), keys: KEYS });
    expect(await endpoints()).toEqual(['carol', 'carol']);
  });
});

describe('daily summary', () => {
  let service: PushService;
  let alice: number;

  beforeEach(async () => {
    service = app.get(PushService);
    alice = await createUser(app, { username: 'alice', password: 'motdepasse1' });
  });

  it('describes the household situation', () => {
    const base = { inStock: 9, today: 0, soon: 0, expired: 0, expiryAlertDays: 3 };
    expect(buildSummary(base)).toBeNull();
    expect(buildSummary({ ...base, soon: 2 })).toMatchObject({
      tone: 'planned',
      url: '/inventaire?vue=liste&echeance=bientot',
    });
    expect(buildSummary({ ...base, soon: 2, expired: 1 })).toMatchObject({
      tone: 'urgent',
      url: '/inventaire?vue=liste&echeance=perime',
    });
    expect(buildSummary({ ...base, today: 1, expired: 1, soon: 1 })).toMatchObject({
      tone: 'urgent',
      url: '/inventaire?vue=liste&echeance=aujourdhui',
    });
  });

  it('sends one notification per eligible subscription, with the household threshold', async () => {
    const bob = await createUser(app, { username: 'bob', password: 'motdepasse1' });
    const carol = await createUser(app, {
      username: 'carol',
      password: 'motdepasse1',
      disabled: true,
    });
    const dave = await createUser(app, {
      username: 'dave',
      password: 'motdepasse1',
      householdId: other,
    });
    await subscribe(HOUSEHOLD, alice, 'alice');
    await subscribe(HOUSEHOLD, bob, 'bob');
    await subscribe(HOUSEHOLD, carol, 'carol-disabled');
    // Dave moved to another household: his old subscription must stay silent.
    await subscribe(HOUSEHOLD, dave, 'dave-moved');
    await subscribe(other, dave, 'dave');
    await stockLine(HOUSEHOLD, '2026-06-05'); // soon only with a threshold of 4 or more
    // Nothing expires in the other household.
    await stockLine(other, '2026-07-30');

    expect(await service.sendDailySummary()).toEqual({ sent: 0, removed: 0 });

    await db().insert(settings).values({ householdId: HOUSEHOLD, expiryAlertDays: 4 });
    expect(await service.sendDailySummary()).toEqual({ sent: 2, removed: 0 });
    expect(sender.sent.map((s) => s.endpoint.replace(url(''), '')).sort()).toEqual([
      'alice',
      'bob',
    ]);
    expect(sender.sent[0]!.payload).toMatchObject({ tone: 'planned' });
    const rows = await db().select().from(pushSubscriptions).orderBy(asc(pushSubscriptions.id));
    expect(
      rows.filter((r) => r.lastSentAt !== null).map((r) => r.endpoint.replace(url(''), '')),
    ).toEqual(['alice', 'bob']);
  });

  it('counts each household on its own stock', async () => {
    const dave = await createUser(app, {
      username: 'dave',
      password: 'motdepasse1',
      householdId: other,
    });
    await subscribe(HOUSEHOLD, alice, 'alice');
    await subscribe(other, dave, 'dave');
    await stockLine(other, '2026-05-30');
    await service.sendDailySummary();
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.endpoint).toBe(url('dave'));
    expect(sender.sent[0]!.payload.tone).toBe('urgent');
  });

  it('deletes a subscription the browser dropped and keeps the others', async () => {
    await subscribe(HOUSEHOLD, alice, 'dead');
    await subscribe(HOUSEHOLD, alice, 'alive');
    await stockLine(HOUSEHOLD, '2026-06-01');
    sender.gone.add(url('dead'));
    expect(await service.sendDailySummary()).toEqual({ sent: 1, removed: 1 });
    expect(await endpoints()).toEqual(['alive']);
  });

  it('does nothing without VAPID keys', async () => {
    await subscribe(HOUSEHOLD, alice, 'alice');
    await stockLine(HOUSEHOLD, '2026-06-01');
    sender.enabled = false;
    expect(await service.sendDailySummary()).toEqual({ sent: 0, removed: 0 });
    expect(sender.sent).toEqual([]);
  });

  it('is run by the scheduler, which never throws', async () => {
    await subscribe(HOUSEHOLD, alice, 'alice');
    await stockLine(HOUSEHOLD, '2026-06-01');
    await app.get(PushScheduler).run();
    expect(sender.sent).toHaveLength(1);
    sender.send = async () => {
      throw new Error('network down');
    };
    await expect(app.get(PushScheduler).run()).resolves.toBeUndefined();
    delete (sender as { send?: unknown }).send;
  });
});
