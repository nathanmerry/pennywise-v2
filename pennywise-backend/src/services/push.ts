import { ECDH } from 'node:crypto';
import { z } from 'zod/v4';
import webpush from 'web-push';
import { prisma } from '../lib/prisma.js';

export interface PushPayload { title: string; body: string; url: string; tag: string }
export interface PushDevice { id: string; endpoint: string; p256dh: string; auth: string }
export type PushResult = 'sent' | 'expired' | 'rejected' | 'uncertain';

export const endpointSchema = z.string().max(4096).url().refine((value) => {
  const url = new URL(value);
  const host = url.hostname;
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && (
    host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
    host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com')
  );
}, 'Unsupported push endpoint');

function validKey(value: string, length: number): boolean {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== length || bytes.toString('base64url') !== value.replace(/=+$/, '')) return false;
  if (length === 65) {
    try { return bytes[0] === 4 && ECDH.convertKey(bytes, 'prime256v1').length === 65; }
    catch { return false; }
  }
  return true;
}

export const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().max(100).refine((key) => validKey(key, 65), 'Invalid public key'),
    auth: z.string().max(30).refine((key) => validKey(key, 16), 'Invalid auth key'),
  }),
});
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export function getPublicKey(): string {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Push is not configured');
  // Validate configuration before telling the browser push is available.
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return VAPID_PUBLIC_KEY;
}

export async function registerSubscription(input: SubscriptionInput): Promise<void> {
  const subscription = subscriptionSchema.parse(input);
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { endpoint: subscription.endpoint, ...subscription.keys },
    update: subscription.keys, // Never reset either daily claim on re-registration.
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: endpointSchema.parse(endpoint) } });
}

export async function sendPush(device: PushDevice, payload: PushPayload): Promise<PushResult> {
  // Invalid config/subscription cannot have reached a push service.
  try {
    getPublicKey();
    subscriptionSchema.parse({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } });
  } catch { return 'rejected'; }
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), { TTL: 3600, timeout: 15_000 });
    return 'sent'; // Accepted by the push service, not confirmed phone delivery.
  } catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : undefined;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
      return 'expired';
    }
    // Explicit client rejection is safe to retry. Network errors and 5xx may be ambiguous.
    return status && [400, 401, 403, 413, 429].includes(status) ? 'rejected' : 'uncertain';
  }
}

export async function sendTestNotification(input: SubscriptionInput): Promise<PushResult> {
  const subscription = subscriptionSchema.parse(input);
  const device = await prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
  if (!device || device.p256dh !== subscription.keys.p256dh || device.auth !== subscription.keys.auth) {
    throw new Error('Device is not registered');
  }
  return sendPush(device, { title: 'Pennywise', body: 'Notifications are ready on this device.', url: '/connections', tag: 'pennywise-test' });
}
