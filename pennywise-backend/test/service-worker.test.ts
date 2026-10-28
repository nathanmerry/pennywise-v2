import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function worker() {
  const handlers: Record<string, Function> = {}; const shown: any[] = []; const opened: string[] = [];
  vm.runInNewContext(readFileSync('../pennywise-frontend/public/sw.js', 'utf8'), {
    URL,
    self: { location: { origin: 'https://pennywise.test' }, addEventListener: (name: string, fn: Function) => { handlers[name] = fn; }, registration: { showNotification: async (...args: any[]) => { shown.push(args); } }, clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } } },
  });
  return { handlers, shown, opened };
}
test('push displays payload and clicking rejects external destinations', async () => {
  const w = worker(); let pending: Promise<void>;
  w.handlers.push({ data: { json: () => ({ title: 'Pennywise', body: 'Hello', url: 'https://evil.test', tag: 'daily' }) }, waitUntil: (p: Promise<void>) => { pending = p; } });
  await pending!; assert.equal(w.shown[0][0], 'Pennywise'); assert.equal(w.shown[0][1].body, 'Hello');
  w.handlers.notificationclick({ notification: { data: { url: 'https://evil.test' }, close() {} }, waitUntil: (p: Promise<void>) => { pending = p; } });
  await pending!; assert.equal(w.opened[0], 'https://pennywise.test/');
});
