/**
 * Pay cycle semantics.
 *
 * Each BudgetMonth row stores the cycle's bounds explicitly:
 *   - cycleStartDate: first day of the cycle (inclusive). For payday-driven cycles
 *     this is the day the user gets paid for that cycle.
 *   - cycleEndDate: last day of the cycle (inclusive). Day before the next payday.
 *
 * This module derives `startInclusive` and `endExclusive` (half-open range, used for
 * date queries) from the stored bounds, plus elapsed/remaining day counters relative
 * to a `now` timestamp.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PayCycle {
  /** Inclusive start of query range = cycleStartDate at 00:00 local. */
  startInclusive: Date;
  /** Exclusive end of query range = cycleEndDate + 1 day at 00:00 local. */
  endExclusive: Date;
  /** First day of the cycle (inclusive) — typically the user's payday for this cycle. */
  cycleStartDate: Date;
  /** Last day of the cycle (inclusive) — day before the next payday. */
  cycleEndDate: Date;
  /** "YYYY-MM" key — matches BudgetMonth.month. */
  budgetMonth: string;
  daysInCycle: number;
  daysElapsed: number;
  daysRemaining: number;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build a PayCycle from a BudgetMonth row's stored bounds. `now` is used only to
 * compute elapsed/remaining day counts.
 */
export function getPayCycleFromBudgetMonth(
  budgetMonth: { month: string; cycleStartDate: Date; cycleEndDate: Date },
  now: Date,
): PayCycle {
  const cycleStartDate = startOfLocalDay(new Date(budgetMonth.cycleStartDate));
  const cycleEndDate = startOfLocalDay(new Date(budgetMonth.cycleEndDate));

  const startInclusive = cycleStartDate;
  const endExclusive = addDaysLocal(cycleEndDate, 1);

  const daysInCycle = Math.max(
    1,
    Math.round(
      (endExclusive.getTime() - startInclusive.getTime()) / MS_PER_DAY,
    ),
  );

  const nowStart = startOfLocalDay(now);
  let daysElapsed: number;
  if (nowStart.getTime() < startInclusive.getTime()) {
    daysElapsed = 0;
  } else if (nowStart.getTime() >= endExclusive.getTime()) {
    daysElapsed = daysInCycle;
  } else {
    daysElapsed = Math.round(
      (nowStart.getTime() - startInclusive.getTime()) / MS_PER_DAY,
    );
  }
  const daysRemaining = Math.max(0, daysInCycle - daysElapsed);

  return {
    startInclusive,
    endExclusive,
    cycleStartDate,
    cycleEndDate,
    budgetMonth: budgetMonth.month,
    daysInCycle,
    daysElapsed,
    daysRemaining,
  };
}

/** Convenience re-export. */
export function getMonthKey(d: Date): string {
  return monthKey(d);
}

/**
 * Pace context scoped to a pay cycle. Field names (totalDaysInMonth/elapsedDays/
 * remainingDays) are kept for compatibility with consumers that predate the
 * cycle-based model — but the values are cycle-based, not calendar-month.
 */
export interface CyclePaceContext {
  totalDaysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedRatio: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;
}

export function getCyclePaceContext(cycle: PayCycle): CyclePaceContext {
  const isCurrent = cycle.daysElapsed > 0 && cycle.daysRemaining > 0;
  const isPast = cycle.daysRemaining === 0;
  const isFuture = cycle.daysElapsed === 0 && !isPast;
  return {
    totalDaysInMonth: cycle.daysInCycle,
    elapsedDays: cycle.daysElapsed,
    remainingDays: cycle.daysRemaining,
    elapsedRatio:
      cycle.daysInCycle > 0 ? cycle.daysElapsed / cycle.daysInCycle : 0,
    isCurrentMonth: isCurrent,
    isPastMonth: isPast,
    isFutureMonth: isFuture,
  };
}
