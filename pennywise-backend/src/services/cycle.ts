/**
 * Pay cycle semantics (Phase 1, payday-first budget model).
 *
 * A pay cycle is the window between two consecutive paydays. Each BudgetMonth
 * row represents the cycle *ending* on its stored paydayDate — so
 * BudgetMonth(2026-04, paydayDate=Apr 24) is the cycle that ends on Apr 24.
 *
 * Cycle bounds use (prevPayday, thisPayday] — start payday is NOT in the
 * cycle, end payday IS. This avoids adjacent cycles overlapping on boundary
 * days. For display ("Pay cycle: 24 Mar – 24 Apr"), the struct exposes
 * previousPaydayDate separately so the UI can show both endpoints as actual
 * payday dates without the off-by-one that startInclusive would imply.
 *
 * Phase 1 keeps BudgetMonth storage monthly and derives the previous payday
 * by subtracting one month. This matches monthly-cadence pay; irregular
 * cadences will need a proper lookup later.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PayCycle {
  /** Inclusive start of the query range: prevPayday + 1 day at 00:00 local. */
  startInclusive: Date;
  /** Exclusive end of the query range: thisPayday + 1 day at 00:00 local. */
  endExclusive: Date;
  /** The payday this cycle ends on (inclusive in the cycle). */
  paydayDate: Date;
  /** The previous payday, exposed for UI labeling — NOT in this cycle. */
  previousPaydayDate: Date;
  /** "YYYY-MM" key of the ending payday — matches BudgetMonth.month. */
  budgetMonth: string;
  daysInCycle: number;
  daysElapsed: number;
  daysRemaining: number;
}

/** Start of local day. We treat all cycle math in local time; payday is a date, not a timestamp. */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

function subtractMonthsPreservingDay(d: Date, months: number): Date {
  // JS Date's setMonth handles day clamping for shorter target months
  // (Mar 31 -> 1 month back -> Mar 3; unusual but deterministic).
  const result = new Date(d.getFullYear(), d.getMonth() - months, d.getDate());
  return startOfLocalDay(result);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * For monthly-cadence pay, the previous payday is one calendar month back.
 * Phase 1 assumption.
 */
export function getPreviousPaydayDate(paydayDate: Date): Date {
  return subtractMonthsPreservingDay(paydayDate, 1);
}

/**
 * Build a PayCycle from a BudgetMonth row. `now` is used only to compute
 * elapsed/remaining day counts — the cycle bounds themselves are derived
 * purely from the stored paydayDate.
 *
 * Historical cycles (paydayDate in the past): daysElapsed caps at daysInCycle, daysRemaining is 0.
 * Future cycles (paydayDate far in the future): daysElapsed is 0, daysRemaining = daysInCycle.
 */
export function getPayCycleFromBudgetMonth(
  budgetMonth: { month: string; paydayDate: Date },
  now: Date,
): PayCycle {
  const thisPayday = startOfLocalDay(new Date(budgetMonth.paydayDate));
  const prevPayday = getPreviousPaydayDate(thisPayday);

  const startInclusive = addDaysLocal(prevPayday, 1);
  const endExclusive = addDaysLocal(thisPayday, 1);

  const daysInCycle = Math.round(
    (endExclusive.getTime() - startInclusive.getTime()) / MS_PER_DAY,
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
    paydayDate: thisPayday,
    previousPaydayDate: prevPayday,
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
 * Pace context scoped to a pay cycle. Shape matches the legacy calendar-month
 * pace context (totalDaysInMonth/elapsedDays/remainingDays field names kept)
 * so existing MonthlyBudgetPace/CategoryPace consumers continue to typecheck —
 * but the VALUES are now cycle-based.
 */
export interface CyclePaceContext {
  totalDaysInMonth: number; // days in cycle
  elapsedDays: number;      // days elapsed in cycle
  remainingDays: number;    // days remaining in cycle
  elapsedRatio: number;
  isCurrentMonth: boolean;  // cycle contains today
  isPastMonth: boolean;     // cycle has fully elapsed
  isFutureMonth: boolean;   // cycle starts after today
}

export function getCyclePaceContext(cycle: PayCycle): CyclePaceContext {
  const isCurrent =
    cycle.daysElapsed > 0 && cycle.daysRemaining > 0;
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
