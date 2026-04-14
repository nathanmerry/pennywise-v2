import { useMemo, useState } from "react";
import {
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  ArrowUpDown,
  CalendarIcon,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  type AnalysisPreset,
  type CategoryAnalysisRow,
  type SpendingAnalysisFilters,
} from "@/lib/api";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useSpendingAnalysis } from "@/hooks/use-budget";
import { SpendingAnalysisDrawer } from "@/components/spending-analysis-drawer";

type SortKey =
  | "spend"
  | "shareOfTotal"
  | "changeAmount"
  | "transactionCount"
  | "averageTransaction";
type SortDirection = "asc" | "desc";

const PRESET_OPTIONS: Array<{ value: AnalysisPreset; label: string }> = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_4_months", label: "Last 4 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom range" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTooltipCurrency(value: unknown): string {
  if (typeof value === "number") {
    return formatCurrency(value);
  }

  const numericValue = Number(value ?? 0);
  return formatCurrency(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${amount < 0 ? "-" : ""}£${Math.round(Math.abs(amount) / 100) / 10}k`;
  }
  return `${amount < 0 ? "-" : ""}£${Math.round(Math.abs(amount))}`;
}

function formatChange(amount: number | null, percent: number | null): string {
  if (amount === null) {
    return "No comparison";
  }

  const sign = amount > 0 ? "+" : "";
  const percentText = percent === null ? "" : ` (${sign}${Math.round(percent)}%)`;
  return `${sign}${formatCurrency(amount)}${percentText}`;
}

function formatDateRangeLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return `${format(startDate, "d MMM yyyy")} - ${format(endDate, "d MMM yyyy")}`;
}

function getPresetLabel(preset: AnalysisPreset): string {
  return PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "Custom range";
}

function getCurrentDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function resolvePresetRange(
  preset: AnalysisPreset,
  customRange: { start: Date | null; end: Date | null }
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

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);

  if (values.length === 0 || max === 0) {
    return <div className="h-8 w-24 rounded bg-muted/60" />;
  }

  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-8 w-24 overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-primary"
      />
    </svg>
  );
}

function SummaryCard({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold">{primary}</div>
        {secondary && <p className="text-sm text-muted-foreground">{secondary}</p>}
      </CardContent>
    </Card>
  );
}

function getBudgetBadge(row: CategoryAnalysisRow) {
  if (!row.budget?.status) return null;

  const text = row.budget.status.replace("_", " ");
  const className =
    row.budget.status === "over_budget"
      ? "bg-destructive text-destructive-foreground"
      : row.budget.status === "over_pace"
        ? "bg-amber-500 text-white"
        : "bg-green-500 text-white";

  return <Badge className={className}>{text}</Badge>;
}

export function SpendingPage() {
  const [preset, setPreset] = useState<AnalysisPreset>("this_month");
  const [chartMode, setChartMode] = useState<"daily" | "cumulative" | "weekly">("daily");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();

  const resolvedRange = useMemo(() => resolvePresetRange(preset, customRange), [preset, customRange]);

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
    [resolvedRange, comparePrevious, preset, accountId, categoryId, includeIgnored]
  );

  const { data: analysis, isLoading } = useSpendingAnalysis(filters);

  const sortedCategories = useMemo(() => {
    if (!analysis?.categories) return [];

    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...analysis.categories].sort((left, right) => {
      const leftValue = left[sortKey] ?? 0;
      const rightValue = right[sortKey] ?? 0;
      return ((leftValue as number) - (rightValue as number)) * multiplier;
    });
  }, [analysis?.categories, sortDirection, sortKey]);

  // Cumulative chart data enriched with budget pace line
  const cumulativeSeriesWithPace = useMemo(() => {
    if (!analysis?.series) return [];
    const budget = analysis.budgetContext.applicable && analysis.budgetContext.overall
      ? analysis.budgetContext.overall.flexibleBudget
      : null;
    const totalDays = analysis.series.length;
    return analysis.series.map((point, index) => ({
      ...point,
      budgetPace: budget !== null && totalDays > 1
        ? Math.round((budget / (totalDays - 1)) * index)
        : undefined,
    }));
  }, [analysis?.series, analysis?.budgetContext]);

  // Weekly aggregation of daily spending
  const weeklyData = useMemo(() => {
    if (!analysis?.series) return [];
    const weeks: Array<{
      label: string;
      weekStart: string;
      currentSpend: number;
      previousSpend: number | null;
    }> = [];
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
    // Push the final (possibly partial) week
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
  }, [analysis?.series]);

  // Weekly budget allowance reference line
  const weeklyBudgetAllowance = useMemo(() => {
    if (!analysis?.budgetContext.applicable || !analysis.budgetContext.overall) return null;
    const totalDays = analysis.series.length;
    if (totalDays === 0) return null;
    const weeksInRange = Math.max(1, Math.ceil(totalDays / 7));
    return analysis.budgetContext.overall.flexibleBudget / weeksInRange;
  }, [analysis?.budgetContext, analysis?.series.length]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }

    setSortKey(key);
    setSortDirection("desc");
  };

  const periodLabel = formatDateRangeLabel(filters.start, filters.end);
  const selectedAccountLabel =
    accountId ? accounts.find((account) => account.id === accountId)?.accountName ?? "Selected account" : "all accounts";
  const selectedCategoryLabel =
    categoryId ? categories.find((category) => category.id === categoryId)?.name ?? "selected category" : "all categories";
  const hasCustomFilters =
    preset !== "this_month" || !!accountId || !!categoryId || comparePrevious || includeIgnored;

  const resetFilters = () => {
    setPreset("this_month");
    setComparePrevious(false);
    setIncludeIgnored(false);
    setAccountId(undefined);
    setCategoryId(undefined);
    setCustomRange({ start: null, end: null });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Spending Analysis</h1>
          <p className="text-muted-foreground">
            Drill into what changed, where the spend came from, and whether it looks fixable.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card/60 px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Time range
              </span>
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <div className="flex min-w-min items-center gap-1 rounded-xl bg-muted p-1 px-4 sm:px-1">
                  {PRESET_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={preset === option.value ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "rounded-lg shrink-0",
                        preset === option.value
                          ? "shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPreset(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border bg-background px-4 py-2">
                <p className="text-sm font-semibold">{getPresetLabel(preset)}</p>
                <p className="text-sm text-muted-foreground">{periodLabel}</p>
              </div>

              {preset === "custom" && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customRange.start ? format(customRange.start, "dd MMM yyyy") : "Start date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customRange.start ?? undefined}
                        onSelect={(date) => setCustomRange((current) => ({ ...current, start: date ?? null }))}
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customRange.end ? format(customRange.end, "dd MMM yyyy") : "End date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customRange.end ?? undefined}
                        onSelect={(date) => setCustomRange((current) => ({ ...current, end: date ?? null }))}
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-background px-4 py-2 text-sm">
            <p className="text-muted-foreground">Showing posted outflows for {selectedAccountLabel} in {selectedCategoryLabel}.</p>
            <p className="font-medium">
              {comparePrevious ? "Comparing with the previous period." : "No comparison applied."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={accountId || "all"}
              onValueChange={(value) => setAccountId(value === "all" ? undefined : value)}
            >
              <SelectTrigger className="w-full min-w-0 sm:w-auto sm:min-w-44 bg-background">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={categoryId || "all"}
              onValueChange={(value) => setCategoryId(value === "all" ? undefined : value)}
            >
              <SelectTrigger className="w-full min-w-0 sm:w-auto sm:min-w-44 bg-background">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories
                  .filter((category) => !category.parentId)
                  .flatMap((parent) => [
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name}
                    </SelectItem>,
                    ...categories
                      .filter((category) => category.parentId === parent.id)
                      .map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          {`  ${child.name}`}
                        </SelectItem>
                      )),
                  ])}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
                <Button
                  variant={comparePrevious ? "ghost" : "default"}
                  size="sm"
                  onClick={() => setComparePrevious(false)}
                >
                  No comparison
                </Button>
                <Button
                  variant={comparePrevious ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setComparePrevious(true)}
                >
                  Vs previous
                </Button>
              </div>

              <Button
                variant={includeIgnored ? "secondary" : "ghost"}
                size="sm"
                className={cn("rounded-xl", !includeIgnored && "text-muted-foreground")}
                onClick={() => setIncludeIgnored((current) => !current)}
              >
                Include ignored
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(accountId || categoryId || includeIgnored) && (
              <div className="hidden flex-wrap items-center gap-2 lg:flex">
                {accountId && <Badge variant="outline">{selectedAccountLabel}</Badge>}
                {categoryId && <Badge variant="outline">{selectedCategoryLabel}</Badge>}
                {includeIgnored && <Badge variant="outline">Ignored included</Badge>}
              </div>
            )}

            {hasCustomFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.7fr,0.9fr]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-[480px]" />
        </div>
      ) : analysis ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Total spend"
              primary={formatCurrency(analysis.summary.totalSpend)}
              secondary={formatChange(analysis.summary.changeAmount, analysis.summary.changePercent)}
            />
            <SummaryCard
              title="Average per day"
              primary={formatCurrency(analysis.summary.avgPerDay)}
              secondary={`${analysis.currentPeriod.dayCount} days in range`}
            />
            <SummaryCard
              title="Highest category"
              primary={analysis.summary.highestCategory?.categoryName ?? "No spend"}
              secondary={
                analysis.summary.highestCategory
                  ? formatCurrency(analysis.summary.highestCategory.spend)
                  : "Nothing in this range"
              }
            />
            <SummaryCard
              title="Transaction count"
              primary={analysis.summary.transactionCount.toLocaleString()}
              secondary="Posted outflows only"
            />
            <SummaryCard
              title="Recurring spend"
              primary={formatCurrency(analysis.summary.recurringSpend)}
              secondary="Estimated recurring charges"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.7fr,0.9fr]">
            <Card>
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Spend over time</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Track spikes, pacing, and whether the current period is separating from the last one.
                    </p>
                  </div>
                  {analysis.budgetContext.applicable && analysis.budgetContext.overall && (
                    <Badge variant="outline" className="shrink-0">
                      {analysis.budgetContext.overall.status.replace("_", " ")}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={chartMode} onValueChange={(value) => setChartMode(value as "daily" | "cumulative" | "weekly")} className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="daily">Daily spend</TabsTrigger>
                    <TabsTrigger value="cumulative">Cumulative spend</TabsTrigger>
                    <TabsTrigger value="weekly">Weekly spend</TabsTrigger>
                  </TabsList>

                  <div className="h-64 w-full sm:h-80">
                    {chartMode === "weekly" ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" />
                          <YAxis tickFormatter={formatCompactCurrency} width={56} />
                          <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
                          <Bar
                            dataKey="currentSpend"
                            fill="var(--chart-1)"
                            radius={[4, 4, 0, 0]}
                            name="Current period"
                          />
                          {comparePrevious && analysis.previousPeriod && (
                            <Bar
                              dataKey="previousSpend"
                              fill="var(--muted-foreground)"
                              radius={[4, 4, 0, 0]}
                              opacity={0.4}
                              name="Previous period"
                            />
                          )}
                          {weeklyBudgetAllowance !== null && (
                            <ReferenceLine
                              y={weeklyBudgetAllowance}
                              stroke="var(--destructive)"
                              strokeDasharray="6 4"
                              strokeWidth={1.5}
                              label={{ value: "Weekly budget", position: "right", fontSize: 11, fill: "var(--destructive)" }}
                            />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartMode === "cumulative" ? cumulativeSeriesWithPace : analysis.series} key={chartMode}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" minTickGap={24} />
                          <YAxis tickFormatter={formatCompactCurrency} width={56} />
                          <Tooltip
                            formatter={(value) => formatTooltipCurrency(value)}
                            labelFormatter={(_, payload) => {
                              const point = payload?.[0]?.payload as { currentDate?: string } | undefined;
                              return point?.currentDate
                                ? format(new Date(`${point.currentDate}T00:00:00.000Z`), "d MMM yyyy")
                                : "";
                            }}
                          />
                          {chartMode === "daily" ? (
                            <>
                              <Line
                                type="linear"
                                dataKey="currentSpend"
                                stroke="var(--chart-1)"
                                strokeWidth={2}
                                dot={false}
                                name="Current period"
                              />
                              {comparePrevious && analysis.previousPeriod && (
                                <Line
                                  type="linear"
                                  dataKey="previousSpend"
                                  stroke="var(--muted-foreground)"
                                  strokeDasharray="4 4"
                                  strokeWidth={2}
                                  dot={false}
                                  name="Previous period"
                                />
                              )}
                            </>
                          ) : (
                            <>
                              <Line
                                type="linear"
                                dataKey="currentCumulative"
                                stroke="var(--chart-1)"
                                strokeWidth={2}
                                dot={false}
                                name="Current period"
                              />
                              {comparePrevious && analysis.previousPeriod && (
                                <Line
                                  type="linear"
                                  dataKey="previousCumulative"
                                  stroke="var(--muted-foreground)"
                                  strokeDasharray="4 4"
                                  strokeWidth={2}
                                  dot={false}
                                  name="Previous period"
                                />
                              )}
                              {analysis.budgetContext.applicable && analysis.budgetContext.overall && (
                                <Line
                                  type="linear"
                                  dataKey="budgetPace"
                                  stroke="var(--destructive)"
                                  strokeDasharray="6 4"
                                  strokeWidth={1.5}
                                  dot={false}
                                  name="Budget pace"
                                />
                              )}
                            </>
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Top merchants in range</CardTitle>
                <p className="text-sm text-muted-foreground">
                  The fastest way to see what is actually driving the spend.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.topMerchants.length > 0 ? (
                  analysis.topMerchants.map((merchant, index) => (
                    <div
                      key={merchant.merchant}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{index + 1}</p>
                        <p className="truncate font-medium">{merchant.merchant}</p>
                        <p className="text-sm text-muted-foreground">
                          {merchant.transactionCount} transactions · avg{" "}
                          {formatCurrency(merchant.averageTransaction)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold">{formatCurrency(merchant.spend)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No merchant data for this range.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Category breakdown</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Sort the table, then open a category to inspect merchants, timing, and recurring vs one-off spend.
                  </p>
                </div>
                {analysis.budgetContext.applicable && analysis.budgetContext.overall && (
                  <div className="rounded-lg border px-3 py-2 text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pace status
                    </p>
                    <p className="font-semibold">
                      {analysis.budgetContext.overall.status.replace("_", " ")}
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort("spend")}>
                        Spend
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => toggleSort("shareOfTotal")}
                      >
                        % of total
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => toggleSort("changeAmount")}
                      >
                        Vs previous
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => toggleSort("transactionCount")}
                      >
                        Transactions
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => toggleSort("averageTransaction")}
                      >
                        Avg transaction
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden xl:table-cell">Trend</TableHead>
                    <TableHead className="hidden sm:table-cell">Budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCategories.length > 0 ? (
                    sortedCategories.map((row) => (
                      <TableRow
                        key={row.categoryId}
                        className="cursor-pointer"
                        data-state={selectedCategoryId === row.categoryId ? "selected" : undefined}
                        onClick={() => setSelectedCategoryId(row.categoryId)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{row.categoryName}</p>
                              <p className="text-xs text-muted-foreground sm:text-sm">
                                {row.transactionCount} transactions
                                <span className="md:hidden">
                                  {" · "}
                                  {formatChange(row.changeAmount, row.changePercent)}
                                </span>
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">{formatCurrency(row.spend)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{Math.round(row.shareOfTotal)}%</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div
                            className={cn(
                              "inline-flex items-center gap-1 font-medium",
                              row.changeAmount === null
                                ? "text-muted-foreground"
                                : row.changeAmount > 0
                                  ? "text-destructive"
                                  : row.changeAmount < 0
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                            )}
                          >
                            {row.changeAmount !== null && row.changeAmount > 0 ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : row.changeAmount !== null && row.changeAmount < 0 ? (
                              <ArrowDownRight className="h-4 w-4" />
                            ) : (
                              <ArrowUpDown className="h-4 w-4" />
                            )}
                            <span>{formatChange(row.changeAmount, row.changePercent)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{row.transactionCount}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatCurrency(row.averageTransaction)}</TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Sparkline values={row.sparkline} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{getBudgetBadge(row) ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No categories found for the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No spending data found for the current filters.
          </CardContent>
        </Card>
      )}

      <SpendingAnalysisDrawer
        open={selectedCategoryId !== null}
        onOpenChange={(open) => !open && setSelectedCategoryId(null)}
        categoryId={selectedCategoryId}
        filters={filters}
      />
    </div>
  );
}
