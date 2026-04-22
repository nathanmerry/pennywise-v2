import { startOfMonth, startOfYear } from "date-fns";
import type { AnalysisPreset, PayCycleSummary } from "@/shared/lib/api";

export const PRESET_OPTIONS: Array<{ value: AnalysisPreset; label: string }> = [
  { value: "this_cycle", label: "This cycle" },
  { value: "last_cycle", label: "Last cycle" },
  { value: "last_3_cycles", label: "Last 3 cycles" },
  { value: "last_6_cycles", label: "Last 6 cycles" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom range" },
];

export function getPresetLabel(preset: AnalysisPreset): string {
  return (
    PRESET_OPTIONS.find((option) => option.value === preset)?.label ??
    "Custom range"
  );
}

function getCurrentDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/**
 * Cycles arrive from the backend with ISO timestamps produced by Date.toISOString()
 * on local-midnight Dates. Parsing them back through `new Date(iso)` reconstructs the
 * original local date across the installed base.
 */
function parseCycleDate(iso: string): Date {
  return new Date(iso);
}

export type CustomRange = { start: Date | null; end: Date | null };

/**
 * Resolve a preset into a concrete [start, end] (both inclusive) using the
 * supplied cycles (newest first). Cycle presets need current + prior N-1, so
 * index 0 is "this cycle", index N-1 is the oldest cycle in the window.
 *
 * When cycles is empty, cycle presets fall back to a degenerate range (today
 * only) — the page shows an empty-state above this path, so the exact values
 * don't matter, but we return a valid range to keep types clean.
 */
export function resolvePresetRange(
  preset: AnalysisPreset,
  cycles: PayCycleSummary[],
  customRange: CustomRange,
): { start: Date; end: Date } {
  const today = getCurrentDate();

  switch (preset) {
    case "this_cycle": {
      const cycle = cycles[0];
      if (!cycle) return { start: today, end: today };
      return {
        start: parseCycleDate(cycle.startInclusive),
        end: parseCycleDate(cycle.paydayDate),
      };
    }
    case "last_cycle": {
      const cycle = cycles[1];
      if (!cycle) return { start: today, end: today };
      return {
        start: parseCycleDate(cycle.startInclusive),
        end: parseCycleDate(cycle.paydayDate),
      };
    }
    case "last_3_cycles": {
      const window = cycles.slice(0, 3);
      const oldest = window[window.length - 1];
      const newest = window[0];
      if (!oldest || !newest) return { start: today, end: today };
      return {
        start: parseCycleDate(oldest.startInclusive),
        end: parseCycleDate(newest.paydayDate),
      };
    }
    case "last_6_cycles": {
      const window = cycles.slice(0, 6);
      const oldest = window[window.length - 1];
      const newest = window[0];
      if (!oldest || !newest) return { start: today, end: today };
      return {
        start: parseCycleDate(oldest.startInclusive),
        end: parseCycleDate(newest.paydayDate),
      };
    }
    case "ytd":
      return { start: startOfYear(today), end: today };
    case "custom":
      return {
        start: customRange.start ?? startOfMonth(today),
        end: customRange.end ?? today,
      };
  }
}
