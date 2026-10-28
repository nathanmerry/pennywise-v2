import { test } from 'node:test';
import assert from 'node:assert/strict';
import { londonYesterday, buildDailySummary, type SummaryDependencies } from '../src/services/notifications/daily-summary.js';

for (const [now, start, end] of [
  ['2026-01-12T08:00:00Z', '2026-01-11T00:00:00.000Z', '2026-01-11T23:59:59.999Z'],
  ['2026-07-12T07:00:00Z', '2026-07-10T23:00:00.000Z', '2026-07-11T22:59:59.999Z'],
  ['2026-03-30T07:00:00Z', '2026-03-29T00:00:00.000Z', '2026-03-29T22:59:59.999Z'],
  ['2026-10-26T08:00:00Z', '2026-10-24T23:00:00.000Z', '2026-10-25T23:59:59.999Z'],
]) test(`London yesterday inclusive bounds at ${now}`, () => {
  const result = londonYesterday(new Date(now));
  assert.equal(result.startDate.toISOString(), start);
  assert.equal(result.endDate.toISOString(), end);
});
const now = new Date('2026-10-28T08:00:00Z');
function dependencies(): SummaryDependencies {
  return {
    sync: async () => [{ connectionId: 'bank', status: 'active', synced: 0 }],
    connections: async () => [{ id: 'bank', status: 'active', lastSyncedAt: new Date('2026-10-28T07:54:00Z') }],
    budgets: async () => [{ month: '2026-11', cycleStartDate: new Date('2026-10-25'), cycleEndDate: new Date('2026-11-24') }],
    overview: async (month) => { assert.equal(month, '2026-11'); return { remainingFlexible: 215 }; },
    outflows: async (filters) => { assert.equal(filters.endDate.toISOString(), '2026-10-27T23:59:59.999Z'); return [{ amount: 42.8 }]; },
  };
}
test('fresh summary reuses stored pay-cycle budget and reportable outflows', async () => {
  const result = await buildDailySummary(now, dependencies());
  assert.match(result.body, /£42.80/); assert.match(result.body, /£215/); assert.match(result.body, /07:54/);
  assert.equal(result.tag, 'pennywise-daily-2026-10-28');
});
for (const mode of ['missing', 'ambiguous'] as const) test(`${mode} budget is unavailable`, async () => {
  const deps = dependencies(); const rows = await deps.budgets(); deps.budgets = async () => mode === 'missing' ? [] : [...rows, ...rows];
  deps.overview = async () => { assert.fail('must not invent a budget'); };
  const result = await buildDailySummary(now, deps); assert.match(result.body, /budget: unavailable/i);
});
for (const mode of ['partial', 'disconnected', 'old', 'never', 'missing-outcome', 'thrown', 'no-banks'] as const) test(`${mode} sync warns without financial totals`, async () => {
  const deps = dependencies();
  const banks = await deps.connections();
  if (mode === 'partial') deps.sync = async () => [{ connectionId: 'bank', status: 'active', synced: 2 }, { connectionId: 'other', status: 'error', synced: 0 }];
  if (mode === 'disconnected') deps.connections = async () => [...banks, { id: 'other', status: 'requires_reconnect', lastSyncedAt: null }];
  if (mode === 'old') deps.connections = async () => [{ ...banks[0], lastSyncedAt: new Date('2026-10-27T07:59:59Z') }];
  if (mode === 'never') deps.connections = async () => [{ ...banks[0], lastSyncedAt: null }];
  if (mode === 'missing-outcome') deps.sync = async () => [];
  if (mode === 'thrown') deps.sync = async () => { throw new Error('offline'); };
  if (mode === 'no-banks') { deps.sync = async () => []; deps.connections = async () => []; }
  deps.outflows = async () => { assert.fail('must not calculate misleading totals'); };
  const result = await buildDailySummary(now, deps);
  assert.match(result.body, /incomplete|stale/i); assert.doesNotMatch(result.body, /£/);
  if (['partial', 'disconnected', 'missing-outcome', 'thrown'].includes(mode)) assert.match(result.body, /28 Oct 2026.*07:54/);
});
