import { prisma } from '../../lib/prisma.js';
import { sendPush, type PushDevice, type PushPayload, type PushResult } from '../push.js';
import { buildDailySummary, londonDateKey } from './daily-summary.js';

interface DailyDependencies {
  build(now: Date): Promise<PushPayload>;
  send(device: PushDevice, payload: PushPayload): Promise<PushResult>;
}
export async function runDailyNotifications(now: Date, deps: DailyDependencies = { build: buildDailySummary, send: sendPush }) {
  const day = londonDateKey(now);
  const counts = { sent: 0, skipped: 0, expired: 0, failed: 0 };
  const devices = await prisma.pushSubscription.findMany();
  const pending = devices.filter((device) => (!device.lastAttemptDate || device.lastAttemptDate < day) && (!device.lastSentDate || device.lastSentDate < day));
  counts.skipped = devices.length - pending.length;
  if (pending.length === 0) return counts;
  // Build before claiming: a failed sync/report build must not consume a day.
  const payload = await deps.build(now);
  for (const device of pending) {
    try {
      // One atomic conditional UPDATE per device, safe across processes.
      // Monotonic date guards also prevent an old job replacing a newer claim.
      const claim = await prisma.pushSubscription.updateMany({
        where: {
          id: device.id,
          AND: [
            { OR: [{ lastAttemptDate: null }, { lastAttemptDate: { lt: day } }] },
            { OR: [{ lastSentDate: null }, { lastSentDate: { lt: day } }] },
          ],
        },
        data: { lastAttemptDate: day },
      });
      if (!claim.count) { counts.skipped++; continue; }
      const result = await deps.send(device, payload);
      if (result === 'sent') {
        await prisma.pushSubscription.updateMany({ where: { id: device.id, lastAttemptDate: day }, data: { lastSentDate: day } });
        counts.sent++;
      } else if (result === 'expired') counts.expired++;
      else {
        if (result === 'rejected') {
          await prisma.pushSubscription.updateMany({ where: { id: device.id, lastAttemptDate: day }, data: { lastAttemptDate: null } });
        }
        counts.failed++;
      }
    } catch {
      // A crash/network error may follow acceptance. Retain the claim rather
      // than risk duplicate delivery; no endpoint, keys or payload is logged.
      counts.failed++;
    }
  }
  return counts;
}
