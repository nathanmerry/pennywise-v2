import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createECDH } from 'node:crypto';
import webpush from 'web-push';
import { prisma } from '../src/lib/prisma.js';
import pushRoutes from '../src/routes/push.js';
import { stubMethod } from './helpers.js';
afterEach(() => mock.restoreAll());

async function server(t: any) {
  const app = express(); app.use(express.json()); app.use('/api/push', pushRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as { port: number };
  return (route: string, body: unknown, method = 'POST') => fetch(`http://127.0.0.1:${address.port}/api/push${route}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('routes reject malformed subscriptions without reflecting endpoint or key material', async (t) => {
  const request = await server(t);
  for (const route of ['/subscriptions', '/test']) {
    const response = await request(route, { endpoint: 'https://internal.invalid/secret', keys: { auth: 'secret-key' } });
    assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /secret/);
  }
});
test('route test sends only one device; expired endpoint becomes 410 and DELETE is retryable', async (t) => {
  const request = await server(t); const key = createECDH('prime256v1'); key.generateKeys();
  const subscription = { endpoint: 'https://web.push.apple.com/device-one', keys: { auth: Buffer.alloc(16, 8).toString('base64url'), p256dh: key.getPublicKey().toString('base64url') } };
  let saved = false, sends = 0;
  stubMethod(prisma.pushSubscription, 'upsert', async () => { saved = true; });
  stubMethod(prisma.pushSubscription, 'findUnique', async ({ where }: any) => saved && where.endpoint === subscription.endpoint ? { id: 'one', endpoint: subscription.endpoint, ...subscription.keys } : null);
  stubMethod(prisma.pushSubscription, 'deleteMany', async () => { saved = false; return { count: 1 }; });
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'mailto:test@example.com' });
  mock.method(webpush, 'setVapidDetails', () => {});
  mock.method(webpush, 'sendNotification', async (target: any) => { assert.equal(target.endpoint, subscription.endpoint); sends++; throw { statusCode: 410 }; });
  assert.equal((await request('/subscriptions', subscription)).status, 200);
  assert.equal((await request('/test', subscription)).status, 410);
  assert.equal(saved, false); assert.equal(sends, 1);
  assert.equal((await request('/subscriptions', { endpoint: subscription.endpoint }, 'DELETE')).status, 200);
  assert.equal((await request('/subscriptions', { endpoint: subscription.endpoint }, 'DELETE')).status, 200);
});
