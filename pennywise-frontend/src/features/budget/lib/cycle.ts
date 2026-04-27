import type { PayCycleSummary } from "@/shared/lib/api";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonthsToKey(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The pay cycle whose date range contains today, or the most recent past one. */
export function findActiveCycle(cycles: PayCycleSummary[]): PayCycleSummary | null {
  if (cycles.length === 0) return null;
  const today = todayIso();
  const containing = cycles.find((c) => c.startInclusive <= today && today < c.endExclusive);
  if (containing) return containing;
  const past = cycles
    .filter((c) => c.startInclusive <= today)
    .sort((a, b) => b.startInclusive.localeCompare(a.startInclusive));
  return past[0] ?? cycles[cycles.length - 1] ?? null;
}

/**
 * Display name for a cycle, named after the calendar month covering most of its days.
 * A cycle running 25 Apr → 25 May becomes "May 2026 cycle".
 */
export function getCycleDisplayName(cycle: PayCycleSummary | null, fallbackMonth: string): string {
  if (!cycle) {
    const [year, monthNum] = fallbackMonth.split("-").map(Number);
    const date = new Date(year, monthNum - 1);
    return `${date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} cycle`;
  }
  const start = new Date(cycle.startInclusive);
  const end = new Date(cycle.endExclusive);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return `${mid.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} cycle`;
}

export function getCycleDateRange(cycle: PayCycleSummary): string {
  const start = new Date(cycle.startInclusive);
  const lastDay = new Date(cycle.endExclusive);
  lastDay.setDate(lastDay.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(lastDay)}`;
}

export function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** "24 May – 31 May" style range. Inclusive end. */
export function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}
