import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDailyNotifications } from '../src/services/notifications/daily-notifications.js';
import { prisma } from '../src/lib/prisma.js';
import { stubMethod } from './helpers.js';

const now = new Date('2026-10-28T08:00:00Z');
const payload = { title: 'Pennywise', body: 'Summary', url: '/', tag: 'pennywise-daily-2026-10-28' };
function database(count = 1) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i), endpoint: `device-${i}`, p256dh: 'key', auth: 'auth', lastAttemptDate: null as string | null, lastSentDate: null as string | null }));
  stubMethod(prisma.pushSubscription, 'findMany', async () => rows.map((row) => ({ ...row })));
  stubMethod(prisma.pushSubscription, 'updateMany', async ({ where, data }: any) => {
    const row = rows.find((r) => r.id === where.id);
    if (!row) return { count: 0 };
    if (where.AND) {
      // Verify the production query guards BOTH nullable daily state fields.
      assert.deepEqual(where.AND, [
        { OR: [{ lastAttemptDate: null }, { lastAttemptDate: { lt: '2026-10-28' } }] },
        { OR: [{ lastSentDate: null }, { lastSentDate: { lt: '2026-10-28' } }] },
      ]);
      if ((row.lastAttemptDate && row.lastAttemptDate >= data.lastAttemptDate) || (row.lastSentDate && row.lastSentDate >= data.lastAttemptDate)) return { count: 0 };
    } else if (row.lastAttemptDate !== where.lastAttemptDate) return { count: 0 };
    Object.assign(row, data); return { count: 1 };
  });
  return rows;
}
test('repeat and concurrent runs only send once per device', async () => {
  const rows = database(); let sends = 0;
  const deps = { build: async () => payload, send: async () => { sends++; await new Promise((resolve) => setTimeout(resolve, 5)); return 'sent' as const; } };
  const results = await Promise.all([runDailyNotifications(now, deps), runDailyNotifications(now, deps)]);
  assert.equal(sends, 1); assert.equal(results.reduce((n, r) => n + r.sent, 0), 1);
  assert.equal(rows[0].lastSentDate, '2026-10-28');
  assert.deepEqual(await runDailyNotifications(now, deps), { sent: 0, skipped: 1, expired: 0, failed: 0 });
});
test('partial device success records independent sent, expired and failed counts', async () => {
  const rows = database(3);
  const result = await runDailyNotifications(now, { build: async () => payload, send: async (device) => device.id === '0' ? 'sent' : device.id === '1' ? 'expired' : 'uncertain' });
  assert.deepEqual(result, { sent: 1, skipped: 0, expired: 1, failed: 1 });
  assert.equal(rows[0].lastSentDate, '2026-10-28'); assert.equal(rows[2].lastAttemptDate, '2026-10-28');
});
test('definite rejection releases the claim for retry', async () => {
  const rows = database();
  const result = await runDailyNotifications(now, { build: async () => payload, send: async () => 'rejected' });
  assert.equal(result.failed, 1); assert.equal(rows[0].lastAttemptDate, null);
  assert.equal((await runDailyNotifications(now, { build: async () => payload, send: async () => 'sent' })).sent, 1);
});
test('uncertain delivery or process-crash claim is retained and skipped', async () => {
  const rows = database();
  await runDailyNotifications(now, { build: async () => payload, send: async () => { throw new Error('connection reset'); } });
  assert.equal(rows[0].lastAttemptDate, '2026-10-28'); assert.equal(rows[0].lastSentDate, null);
  const result = await runDailyNotifications(now, { build: async () => { assert.fail('do not sync for already claimed devices'); }, send: async () => { assert.fail('duplicate send'); } });
  assert.equal(result.skipped, 1);
});
test('failure building payload does not consume device claims', async () => {
  const rows = database();
  await assert.rejects(runDailyNotifications(now, { build: async () => { throw new Error('db unavailable'); }, send: async () => 'sent' }));
  assert.equal(rows[0].lastAttemptDate, null);
});
test('a previous-day claim permits the next daily notification', async () => {
  const rows = database(); rows[0].lastAttemptDate = '2026-10-27'; rows[0].lastSentDate = '2026-10-27';
  assert.equal((await runDailyNotifications(now, { build: async () => payload, send: async () => 'sent' })).sent, 1);
});
test('an older delayed invocation cannot replace a newer date claim', async () => {
  const rows = database(); rows[0].lastAttemptDate = '2026-10-29';
  assert.equal((await runDailyNotifications(now, { build: async () => payload, send: async () => { assert.fail('stale job'); } })).skipped, 1);
});
