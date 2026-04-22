import { useMemo } from "react";
import { format } from "date-fns";
import type {
  AnalysisTimeSeriesPoint,
  CategoryAnalysisRow,
  SpendingAnalysisResponse,
} from "@/shared/lib/api";
import type { CategorySortKey } from "../components/category-breakdown-card";
import type { WeeklyPoint } from "../components/weekly-spend-chart";

type SortDirection = "asc" | "desc";

export interface SpendingAnalysisViewModel {
  sortedCategories: CategoryAnalysisRow[];
  flexibleCategories: CategoryAnalysisRow[];
  fixedCategories: CategoryAnalysisRow[];
  cumulativeSeries: AnalysisTimeSeriesPoint[];
  weeklyData: WeeklyPoint[];
}

export function useSpendingAnalysisViewModel(
  analysis: SpendingAnalysisResponse | undefined,
  sortKey: CategorySortKey,
  sortDirection: SortDirection,
): SpendingAnalysisViewModel {
  const sortedCategories = useMemo(() => {
    if (!analysis?.categories) return [];

    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...analysis.categories].sort((left, right) => {
      const leftValue = left[sortKey] ?? 0;
      const rightValue = right[sortKey] ?? 0;
      return ((leftValue as number) - (rightValue as number)) * multiplier;
    });
  }, [analysis, sortDirection, sortKey]);

  const cumulativeSeries = useMemo<AnalysisTimeSeriesPoint[]>(
    () => analysis?.series ?? [],
    [analysis],
  );

  const weeklyData = useMemo<WeeklyPoint[]>(() => {
    if (!analysis?.series) return [];
    const weeks: WeeklyPoint[] = [];
    let weekSpend = 0;
    let weekPrevSpend = 0;
    let weekStart = "";
    let hasPrevious = false;

    for (let i = 0; i < analysis.series.length; i++) {
      const point = analysis.series[i];
      if (i % 7 === 0) {
        if (i > 0) {
          weeks.push({
            label: weekStart,
            weekStart,
            currentSpend: weekSpend,
            previousSpend: hasPrevious ? weekPrevSpend : null,
          });
        }
        weekSpend = 0;
        weekPrevSpend = 0;
        weekStart = point.currentDate;
        hasPrevious = false;
      }
      weekSpend += point.currentSpend;
      if (point.previousSpend !== null) {
        weekPrevSpend += point.previousSpend;
        hasPrevious = true;
      }
    }
    if (weekSpend > 0 || weekStart) {
      weeks.push({
        label: weekStart,
        weekStart,
        currentSpend: weekSpend,
        previousSpend: hasPrevious ? weekPrevSpend : null,
      });
    }
    return weeks.map((w) => ({
      ...w,
      label: format(new Date(`${w.weekStart}T00:00:00.000Z`), "d MMM"),
    }));
  }, [analysis]);

  const flexibleCategories = useMemo(
    () => sortedCategories.filter((row) => row.kind !== "fixed"),
    [sortedCategories],
  );
  const fixedCategories = useMemo(
    () => sortedCategories.filter((row) => row.kind === "fixed"),
    [sortedCategories],
  );

  return {
    sortedCategories,
    flexibleCategories,
    fixedCategories,
    cumulativeSeries,
    weeklyData,
  };
}
