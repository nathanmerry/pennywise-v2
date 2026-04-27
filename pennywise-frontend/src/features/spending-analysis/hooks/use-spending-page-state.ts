import { useMemo, useState } from "react";
import { format } from "date-fns";
import type {
  AnalysisPreset,
  PayCycleSummary,
  SpendingAnalysisFilters,
} from "@/shared/lib/api";
import {
  buildCycleWeeks,
  resolvePresetRange,
  type CustomRange,
  type CycleWeek,
} from "../lib/spending-filters";
import { formatDateRangeLabel } from "../lib/spending-formatters";
import type { CategorySortKey } from "../components/category-breakdown-card";
import type { ChartMode } from "../components/spending-charts-card";

function isSingleCyclePreset(preset: AnalysisPreset): boolean {
  return preset === "this_cycle" || preset === "last_cycle";
}

type SortDirection = "asc" | "desc";

export function useSpendingPageState(cycles: PayCycleSummary[]) {
  const [preset, setPresetRaw] = useState<AnalysisPreset>("this_cycle");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [customRange, setCustomRange] = useState<CustomRange>({
    start: null,
    end: null,
  });
  const [sortKey, setSortKey] = useState<CategorySortKey>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(
    null,
  );

  // Changing the preset always resets the week slice — a W3 selection has no
  // meaning once the underlying cycle window changes.
  const setPreset = (next: AnalysisPreset) => {
    setPresetRaw(next);
    setSelectedWeekIndex(null);
  };

  const resolvedRange = useMemo(
    () => resolvePresetRange(preset, cycles, customRange),
    [preset, cycles, customRange],
  );

  const weeks = useMemo<CycleWeek[]>(() => {
    if (!isSingleCyclePreset(preset)) return [];
    return buildCycleWeeks(resolvedRange.start, resolvedRange.end);
  }, [preset, resolvedRange]);

  const selectedWeek =
    selectedWeekIndex !== null ? weeks[selectedWeekIndex] ?? null : null;

  // When a week is selected, narrow the query range and force preset=custom so
  // the backend correctly disables cycle-only budget gating (only full cycles
  // should show budget context).
  const effectiveRange = selectedWeek
    ? { start: selectedWeek.start, end: selectedWeek.end }
    : resolvedRange;
  const effectivePreset: AnalysisPreset = selectedWeek ? "custom" : preset;

  const filters = useMemo<SpendingAnalysisFilters>(
    () => ({
      start: format(effectiveRange.start, "yyyy-MM-dd"),
      end: format(effectiveRange.end, "yyyy-MM-dd"),
      compare: comparePrevious,
      preset: effectivePreset,
      accountId,
      categoryId,
      includeIgnored,
    }),
    [
      effectiveRange,
      effectivePreset,
      comparePrevious,
      accountId,
      categoryId,
      includeIgnored,
    ],
  );

  const periodLabel = formatDateRangeLabel(filters.start, filters.end);

  const hasCustomFilters =
    preset !== "this_cycle" ||
    !!accountId ||
    !!categoryId ||
    comparePrevious ||
    includeIgnored ||
    selectedWeekIndex !== null;

  const resetFilters = () => {
    setPresetRaw("this_cycle");
    setSelectedWeekIndex(null);
    setComparePrevious(false);
    setIncludeIgnored(false);
    setAccountId(undefined);
    setCategoryId(undefined);
    setCustomRange({ start: null, end: null });
  };

  const toggleSort = (key: CategorySortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  return {
    preset,
    setPreset,
    chartMode,
    setChartMode,
    comparePrevious,
    setComparePrevious,
    includeIgnored,
    setIncludeIgnored,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    customRange,
    setCustomRange,
    sortKey,
    sortDirection,
    toggleSort,
    selectedCategoryId,
    setSelectedCategoryId,
    filters,
    periodLabel,
    hasCustomFilters,
    resetFilters,
    weeks,
    selectedWeekIndex,
    setSelectedWeekIndex,
    selectedWeek,
  };
}
