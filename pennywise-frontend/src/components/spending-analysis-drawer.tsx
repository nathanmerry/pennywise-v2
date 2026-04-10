import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCategoryDrilldown } from "@/hooks/use-budget";
import type { SpendingAnalysisFilters } from "@/lib/api";

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

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${Math.round(amount / 100) / 10}k`;
  }
  return `${Math.round(amount)}`;
}

function getBudgetBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "over_budget":
      return "bg-destructive text-destructive-foreground";
    case "over_pace":
      return "bg-amber-500 text-white";
    case "on_track":
      return "bg-green-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDelta(amount: number | null, percent: number | null): string {
  if (amount === null) {
    return "No comparison";
  }

  const sign = amount > 0 ? "+" : "";
  const percentText = percent === null ? "" : ` (${sign}${Math.round(percent)}%)`;
  return `${sign}${formatCurrency(amount)}${percentText}`;
}

interface SpendingAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string | null;
  filters: SpendingAnalysisFilters;
}

export function SpendingAnalysisDrawer({
  open,
  onOpenChange,
  categoryId,
  filters,
}: SpendingAnalysisDrawerProps) {
  const { data, isLoading } = useCategoryDrilldown(categoryId, filters);
  const [showAllMerchants, setShowAllMerchants] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-4xl overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : data ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{data.category.categoryName}</SheetTitle>
                {data.budget?.status && (
                  <Badge className={getBudgetBadgeClass(data.budget.status)}>
                    {data.budget.status.replace("_", " ")}
                  </Badge>
                )}
              </div>
              <SheetDescription>
                {formatCurrency(data.category.spend)} across {data.category.transactionCount} transactions
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Change vs previous period</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-2xl font-semibold">
                      {formatDelta(data.category.changeAmount, data.category.changePercent)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Avg transaction {formatCurrency(data.category.averageTransaction)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recurring vs one-off</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Recurring</span>
                      <span className="font-medium">{formatCurrency(data.recurringSplit.recurringSpend)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">One-off</span>
                      <span className="font-medium">{formatCurrency(data.recurringSplit.oneOffSpend)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {data.recurringSplit.recurringTransactionCount} recurring and{" "}
                      {data.recurringSplit.oneOffTransactionCount} one-off transactions
                    </p>
                  </CardContent>
                </Card>
              </div>

              {data.budget && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Budget context</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly budget</p>
                      <p className="text-lg font-semibold">
                        {data.budget.monthlyBudget !== null
                          ? formatCurrency(data.budget.monthlyBudget)
                          : "No budget"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining budget</p>
                      <p className="text-lg font-semibold">
                        {data.budget.remainingBudget !== null
                          ? formatCurrency(data.budget.remainingBudget)
                          : "No budget"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expected by now</p>
                      <p className="text-base font-medium">
                        {data.budget.expectedSpendByNow !== null
                          ? formatCurrency(data.budget.expectedSpendByNow)
                          : "Not available"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pace delta</p>
                      <p className="text-base font-medium">
                        {data.budget.paceDelta !== null
                          ? formatCurrency(data.budget.paceDelta)
                          : "Not available"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Category trend</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.series}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" minTickGap={24} />
                      <YAxis tickFormatter={formatCompact} width={52} />
                      <Tooltip
                        formatter={(value) => formatTooltipCurrency(value)}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as { currentDate?: string } | undefined;
                          return point?.currentDate ? formatDate(point.currentDate) : "";
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="currentSpend"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={false}
                        name="Current"
                      />
                      {data.previousPeriod && (
                        <Line
                          type="linear"
                          dataKey="previousSpend"
                          stroke="var(--muted-foreground)"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          dot={false}
                          name="Previous"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm">Top merchants</CardTitle>
                    {data.topMerchants.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllMerchants(!showAllMerchants)}
                        className="h-8 text-xs"
                      >
                        {showAllMerchants ? "Show less" : `Show all (${data.topMerchants.length})`}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className={showAllMerchants ? "h-auto" : "h-72"}>
                    {data.topMerchants.length > 0 ? (
                      <ResponsiveContainer width="100%" height={showAllMerchants ? data.topMerchants.length * 40 + 40 : 288}>
                        <BarChart data={showAllMerchants ? data.topMerchants : data.topMerchants.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatCompact} />
                          <YAxis
                            type="category"
                            width={110}
                            dataKey="merchant"
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
                          <Bar dataKey="spend" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No merchant data in this range
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Timing pattern</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Weekday spend</span>
                        <span className="font-medium">
                          {formatCurrency(data.weekdayWeekendSplit.weekdaySpend)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Weekend spend</span>
                        <span className="font-medium">
                          {formatCurrency(data.weekdayWeekendSplit.weekendSpend)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Monthly history
                      </p>
                      <div className="space-y-2">
                        {data.monthlyHistory.map((month) => (
                          <div key={month.month} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{month.label}</span>
                            <span className="font-medium">{formatCurrency(month.spend)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Largest transactions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.largestTransactions.length > 0 ? (
                    data.largestTransactions.map((transaction) => (
                      <div
                        key={transaction.transactionId}
                        className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {transaction.merchantName || transaction.description}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(transaction.transactionDate)}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold">
                          {formatCurrency(transaction.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No transactions in this category for the selected range.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Category not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
