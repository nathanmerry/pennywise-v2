import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import webpush from 'web-push';
import { stubMethod, restoreMethods } from './helpers.js';
import { subscriptionSchema, registerSubscription, sendTestNotification, sendPush } from '../src/services/push.js';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const subscription = { endpoint: 'https://web.push.apple.com/device-one', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') } };
afterEach(() => mock.restoreAll());

test('validates real encryption keys and supported push hosts', () => {
  assert.equal(subscriptionSchema.safeParse(subscription).success, true);
  for (const endpoint of ['http://web.push.apple.com/x', 'https://localhost/x', 'https://web.push.apple.com.evil.test/x', 'https://user:pass@web.push.apple.com/x', 'https://web.push.apple.com:8443/x', 'https://127.0.0.1/x']) {
    assert.equal(subscriptionSchema.safeParse({ ...subscription, endpoint }).success, false, endpoint);
  }
  for (const keys of [{ auth: 'bad', p256dh: subscription.keys.p256dh }, { auth: subscription.keys.auth, p256dh: Buffer.alloc(65, 4).toString('base64url') }]) {
    assert.equal(subscriptionSchema.safeParse({ ...subscription, keys }).success, false);
  }
});

test('upsert preserves daily claims and refreshes keys', async () => {
  let input: any;
  stubMethod(prisma.pushSubscription, 'upsert', async (args: any) => { input = args; return args.create; });
  await registerSubscription(subscription);
  assert.deepEqual(input.where, { endpoint: subscription.endpoint });
  assert.deepEqual(input.update, subscription.keys);
  assert.equal(input.create.endpoint, subscription.endpoint);
});

function configureSender() {
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'mailto:owner@example.com' });
  mock.method(webpush, 'setVapidDetails', () => {});
}

test('test notification targets only the registered requesting device and never changes daily claims', async () => {
  configureSender();
  let sentTo: any;
  stubMethod(prisma.pushSubscription, 'findUnique', async () => ({ id: 'one', endpoint: subscription.endpoint, ...subscription.keys }));
  mock.method(webpush, 'sendNotification', async (target: any) => { sentTo = target; return { statusCode: 201 }; });
  assert.equal(await sendTestNotification(subscription), 'sent');
  assert.deepEqual(sentTo, subscription);
});

test('unknown device or mismatched keys cannot trigger a test send', async () => {
  stubMethod(prisma.pushSubscription, 'findUnique', async () => null);
  await assert.rejects(sendTestNotification(subscription), /registered/);
  mock.restoreAll();
  restoreMethods();
  stubMethod(prisma.pushSubscription, 'findUnique', async () => ({ ...subscription.keys, auth: 'other' }));
  await assert.rejects(sendTestNotification(subscription), /registered/);
});

for (const statusCode of [404, 410]) test(`removes expired device on ${statusCode}`, async () => {
  configureSender();
  let removed: any;
  mock.method(webpush, 'sendNotification', async () => { throw { statusCode, body: 'must not log' }; });
  stubMethod(prisma.pushSubscription, 'deleteMany', async (args: any) => { removed = args.where; return { count: 1 }; });
  assert.equal(await sendPush({ id: 'one', endpoint: subscription.endpoint, ...subscription.keys }, { title: 'Test', body: 'Test', url: '/', tag: 'test' }), 'expired');
  assert.deepEqual(removed, { id: 'one' });
});
