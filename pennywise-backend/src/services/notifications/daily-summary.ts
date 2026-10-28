import { prisma } from '../../lib/prisma.js';
import type { PushPayload } from '../push.js';

const zone = 'Europe/London';
export function londonDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function londonMidnight(key: string): Date {
  const utcMidnight = new Date(`${key}T00:00:00.000Z`);
  // London changes clocks at 01:00 UTC, so the offset at 00:00 UTC is
  // also the offset at this calendar day's local midnight (including DST days).
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(utcMidnight));
  return new Date(utcMidnight.getTime() - hour * 3_600_000);
}
export function londonYesterday(now: Date): { startDate: Date; endDate: Date } {
  const today = londonDateKey(now);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return { startDate: londonMidnight(yesterday), endDate: new Date(londonMidnight(today).getTime() - 1) };
}
export interface SummaryDependencies {
  sync(): Promise<{ connectionId: string; status: string; synced: number }[]>;
  connections(): Promise<{ id: string; status: string; lastSyncedAt: Date | null }[]>;
  budgets(): Promise<{ month: string; cycleStartDate: Date; cycleEndDate: Date }[]>;
  overview(month: string): Promise<{ remainingFlexible: number } | null>;
  outflows(filters: { startDate: Date; endDate: Date }): Promise<{ amount: number }[]>;
}
const production: SummaryDependencies = {
  sync: async () => (await import('../sync.js')).syncAllConnections(),
  connections: () => prisma.bankConnection.findMany({ select: { id: true, status: true, lastSyncedAt: true } }),
  budgets: () => prisma.budgetMonth.findMany({ select: { month: true, cycleStartDate: true, cycleEndDate: true } }),
  overview: async (month) => (await import('../budget.js')).getBudgetOverview(month),
  outflows: async (filters) => (await import('../reporting/reportable-transactions.js')).getReportableOutflows(filters),
};
export async function buildDailySummary(now: Date, deps: SummaryDependencies = production): Promise<PushPayload> {
  const day = londonDateKey(now);
  const payload = { title: 'Pennywise', url: '/', tag: `pennywise-daily-${day}` };
  let outcomes: Awaited<ReturnType<SummaryDependencies['sync']>> = [];
  let syncFailed = false;
  try { outcomes = await deps.sync(); } catch { syncFailed = true; }
  // Include inactive/reconnect-required banks; active sync does not return them.
  const banks = await deps.connections();
  const latest = banks.reduce<Date | null>((date, bank) => bank.lastSyncedAt && (!date || bank.lastSyncedAt > date) ? bank.lastSyncedAt : date, null);
  const stale = syncFailed || banks.length === 0 || outcomes.some((outcome) => outcome.status !== 'active') || banks.some((bank) =>
    bank.status !== 'active' || !bank.lastSyncedAt || now.getTime() - bank.lastSyncedAt.getTime() > 86_400_000 ||
    !outcomes.some((outcome) => outcome.connectionId === bank.id && outcome.status === 'active')
  );
  if (stale) {
    const lastSync = latest ? new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(latest) : 'unavailable';
    return { ...payload, body: `Bank data is incomplete or stale. Open Pennywise to check connections.\nLast successful sync: ${lastSync}` };
  }
  const outflows = await deps.outflows(londonYesterday(now));
  const spent = outflows.reduce((pence, row) => pence + Math.round(row.amount * 100), 0) / 100;
  const budgets = (await deps.budgets()).filter((budget) => londonDateKey(budget.cycleStartDate) <= day && londonDateKey(budget.cycleEndDate) >= day);
  const overview = budgets.length === 1 ? await deps.overview(budgets[0].month) : null;
  const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const balance = overview ? `${money.format(overview.remainingFlexible)} remaining` : 'unavailable';
  const syncTime = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(latest!);
  return { ...payload, body: `Yesterday: ${money.format(spent)} spent\nFlexible budget: ${balance}\nLast bank sync: ${syncTime}` };
}
