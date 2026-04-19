import {
  endOfMonth,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import type { AnalysisPreset } from "@/shared/lib/api";

export const PRESET_OPTIONS: Array<{ value: AnalysisPreset; label: string }> = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_4_months", label: "Last 4 months" },
  { value: "last_6_months", label: "Last 6 months" },
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

export type CustomRange = { start: Date | null; end: Date | null };

export function resolvePresetRange(
  preset: AnalysisPreset,
  customRange: CustomRange,
): { start: Date; end: Date } {
  const today = getCurrentDate();

  switch (preset) {
    case "this_month":
      return { start: startOfMonth(today), end: today };
    case "last_month": {
      const lastMonth = subMonths(today, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case "last_3_months":
      return { start: startOfMonth(subMonths(today, 2)), end: today };
    case "last_4_months":
      return { start: startOfMonth(subMonths(today, 3)), end: today };
    case "last_6_months":
      return { start: startOfMonth(subMonths(today, 5)), end: today };
    case "ytd":
      return { start: startOfYear(today), end: today };
    case "custom":
      return {
        start: customRange.start ?? startOfMonth(today),
        end: customRange.end ?? today,
      };
  }
}
