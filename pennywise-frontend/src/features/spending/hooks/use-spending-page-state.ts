import { useMemo, useState } from "react";
import { format } from "date-fns";
import type {
  Account,
  AnalysisPreset,
  Category,
  SpendingAnalysisFilters,
} from "@/shared/lib/api";
import {
  resolvePresetRange,
  type CustomRange,
} from "../lib/spending-filters";
import { formatDateRangeLabel } from "../lib/spending-formatters";
import type { CategorySortKey } from "../components/category-breakdown-card";
import type { ChartMode } from "../components/spending-charts-card";

type SortDirection = "asc" | "desc";

export function useSpendingPageState(
  accounts: Account[],
  categories: Category[],
) {
  const [preset, setPreset] = useState<AnalysisPreset>("this_month");
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

  const resolvedRange = useMemo(
    () => resolvePresetRange(preset, customRange),
    [preset, customRange],
  );

  const filters = useMemo<SpendingAnalysisFilters>(
    () => ({
      start: format(resolvedRange.start, "yyyy-MM-dd"),
      end: format(resolvedRange.end, "yyyy-MM-dd"),
      compare: comparePrevious,
      preset,
      accountId,
      categoryId,
      includeIgnored,
    }),
    [
      resolvedRange,
      comparePrevious,
      preset,
      accountId,
      categoryId,
      includeIgnored,
    ],
  );

  const periodLabel = formatDateRangeLabel(filters.start, filters.end);

  const selectedAccountLabel = accountId
    ? (accounts.find((account) => account.id === accountId)?.accountName ??
      "Selected account")
    : "all accounts";

  const selectedCategoryLabel = categoryId
    ? (categories.find((category) => category.id === categoryId)?.name ??
      "selected category")
    : "all categories";

  const hasCustomFilters =
    preset !== "this_month" ||
    !!accountId ||
    !!categoryId ||
    comparePrevious ||
    includeIgnored;

  const resetFilters = () => {
    setPreset("this_month");
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
    selectedAccountLabel,
    selectedCategoryLabel,
    hasCustomFilters,
    resetFilters,
  };
}
