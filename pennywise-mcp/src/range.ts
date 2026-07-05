import type { CycleSummary } from "./pennywise-client.js";

/**
 * Date-range resolution for the spending-analysis tools.
 *
 * This mirrors the /spending page's client-side logic (spending-filters.ts):
 * presets are resolved from the recent pay cycles, and weeks are consecutive
 * 7-day slices of a single cycle. This is UI-layer date math ONLY — every
 * actual spend figure still comes from the backend's analysis service, so no
 * financial calculation is duplicated here.
 *
 * Dates are formatted YYYY-MM-DD using LOCAL calendar components (matching the
 * frontend's `format(date, "yyyy-MM-dd")`); the MCP server and backend run in
 * the same timezone locally, so cycle boundaries line up exactly.
 */

export const RANGE_PRESETS = [
  "this_cycle",
  "last_cycle",
  "last_3_cycles",
  "last_6_cycles",
  "ytd",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Presets that map to a single cycle and therefore support week slicing. */
const SINGLE_CYCLE_PRESETS: ReadonlySet<RangePreset> = new Set(["this_cycle", "last_cycle"]);

export interface RangeInput {
  preset: RangePreset;
  /** Required when preset === "custom"; YYYY-MM-DD. */
  start?: string;
  end?: string;
  /** 1-based week within the cycle; only valid for this_cycle / last_cycle. */
  week?: number;
}

export interface ResolvedRange {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
  /** What to send as the `preset` query param (forced to "custom" for weeks). */
  preset: RangePreset;
  /** Echoed back for the caller/model. */
  week?: number;
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD as a local calendar date (midnight local). */
function parseLocalDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function diffCalendarDays(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Consecutive inclusive 7-day buckets from a cycle window, matching
 * buildCycleWeeks in the frontend. Returns [{start,end}] in YYYY-MM-DD.
 */
export function buildCycleWeeks(startStr: string, endStr: string): Array<{ start: string; end: string }> {
  const cycleStart = parseLocalDay(startStr);
  const cycleEnd = parseLocalDay(endStr);
  const weeks: Array<{ start: string; end: string }> = [];
  let cursor = cycleStart;
  while (diffCalendarDays(cursor, cycleEnd) >= 0) {
    const tentativeEnd = addDays(cursor, 6);
    const weekEnd = tentativeEnd.getTime() > cycleEnd.getTime() ? cycleEnd : tentativeEnd;
    weeks.push({ start: fmtLocal(cursor), end: fmtLocal(weekEnd) });
    cursor = addDays(weekEnd, 1);
  }
  return weeks;
}

/**
 * Resolve a range request into concrete start/end dates + the preset to send.
 * Throws with a friendly message when a cycle preset can't be satisfied (e.g.
 * not enough cycles, or a week index out of range).
 */
export function resolveRange(input: RangeInput, cycles: CycleSummary[]): ResolvedRange {
  const { preset } = input;

  // --- custom ---
  if (preset === "custom") {
    if (!input.start || !input.end) {
      throw new Error("A custom range requires both `start` and `end` (YYYY-MM-DD).");
    }
    if (!DATE_RE.test(input.start) || !DATE_RE.test(input.end)) {
      throw new Error("`start` and `end` must be YYYY-MM-DD dates.");
    }
    return { start: input.start, end: input.end, preset: "custom" };
  }

  // --- ytd ---
  if (preset === "ytd") {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: fmtLocal(start), end: fmtLocal(now), preset };
  }

  // --- cycle-based presets ---
  const need = preset === "last_6_cycles" ? 6 : preset === "last_3_cycles" ? 3 : preset === "last_cycle" ? 2 : 1;
  if (cycles.length === 0) {
    throw new Error("No pay cycles are configured yet, so cycle-based ranges aren't available. Set up a budget cycle first, or use a custom start/end.");
  }
  if (cycles.length < need) {
    throw new Error(`Not enough pay cycles for "${preset}" — only ${cycles.length} exist. Try a shorter range or a custom start/end.`);
  }

  let start: string;
  let end: string;
  if (preset === "this_cycle") {
    start = fmtLocal(new Date(cycles[0].startInclusive));
    end = fmtLocal(new Date(cycles[0].cycleEndDate));
  } else if (preset === "last_cycle") {
    start = fmtLocal(new Date(cycles[1].startInclusive));
    end = fmtLocal(new Date(cycles[1].cycleEndDate));
  } else {
    const window = cycles.slice(0, preset === "last_6_cycles" ? 6 : 3);
    start = fmtLocal(new Date(window[window.length - 1].startInclusive));
    end = fmtLocal(new Date(window[0].cycleEndDate));
  }

  // --- optional week slice (single-cycle presets only) ---
  if (input.week !== undefined) {
    if (!SINGLE_CYCLE_PRESETS.has(preset)) {
      throw new Error(`Weeks are only available for "this_cycle" or "last_cycle", not "${preset}".`);
    }
    const weeks = buildCycleWeeks(start, end);
    if (input.week < 1 || input.week > weeks.length) {
      throw new Error(`Week ${input.week} is out of range — this cycle has ${weeks.length} weeks (1–${weeks.length}).`);
    }
    const slice = weeks[input.week - 1];
    // The frontend forces preset="custom" when a week is active.
    return { start: slice.start, end: slice.end, preset: "custom", week: input.week };
  }

  return { start, end, preset };
}

/** Validate a YYYY-MM budget month string, or throw. */
export function assertMonthKey(month: string): void {
  if (!MONTH_RE.test(month)) {
    throw new Error(`month must be YYYY-MM (e.g. 2026-06); got "${month}".`);
  }
}
