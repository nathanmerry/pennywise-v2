import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  useCurrentBudgetOverview,
  useSpendingBreakdown,
  useOverspendCategories,
  useMonthlyPace,
} from "@/shared/hooks/use-budget";
import {
  TrendingDown,
  TrendingUp,
  Calendar,
  Wallet,
  PiggyBank,
  ChevronRight,
  Target,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { MonthlyStatusStrip } from "@/features/overview/components/monthly-status-strip";
import { PaceExplanation } from "@/features/overview/components/pace-explanation";
import { MainBudgetPressuresCard } from "@/features/overview/components/main-budget-pressures-card";
import { CategoryPressureDrawer } from "@/features/overview/components/category-pressure-drawer";
import type { MonthlyBudgetPace, SpendingBreakdown } from "@/shared/lib/api";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function computeProjectedMonthEnd(pace: MonthlyBudgetPace): {
  projectedTotal: number;
  overUnder: number;
  isOver: boolean;
} {
  const { overall, elapsedDays, totalDaysInMonth } = pace;
  if (elapsedDays === 0) {
    return { projectedTotal: 0, overUnder: 0, isOver: false };
  }
  const dailyRate = overall.actualFlexibleSpendToDate / elapsedDays;
  const projectedTotal = dailyRate * totalDaysInMonth;
  const overUnder = projectedTotal - overall.flexibleBudget;
  return { projectedTotal, overUnder, isOver: overUnder > 0 };
}

function DailyPulse({ pace, overview }: {
  pace: MonthlyBudgetPace | undefined;
  overview: { dailyAllowance: number; remainingFlexible: number; daysUntilPayday: number; flexibleBudget: number };
}) {
  // Remaining flexible + daily allowance are payday-cycle numbers (see budget.ts).
  // Never pair them with calendar-month day counts.
  const remaining = pace?.overall.remainingFlexibleBudget ?? overview.remainingFlexible;
  const safeDailySpend = overview.dailyAllowance;
  const daysUntilPayday = overview.daysUntilPayday;
  const projection = pace ? computeProjectedMonthEnd(pace) : null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="relative overflow-hidden">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Safe to spend today</p>
              <p className={cn(
                "text-3xl sm:text-4xl font-bold tracking-tight mt-1 wrap-break-word",
                safeDailySpend <= 0 && "text-destructive"
              )}>
                {formatCurrencyPrecise(Math.max(0, safeDailySpend))}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {formatCurrency(remaining)} remaining over {daysUntilPayday} {daysUntilPayday === 1 ? "day" : "days"} until payday
              </p>
            </div>
            <div className={cn(
              "shrink-0 rounded-full p-3",
              safeDailySpend > 0 ? "bg-green-100 dark:bg-green-950/40" : "bg-destructive/10"
            )}>
              <Wallet className={cn(
                "h-6 w-6",
                safeDailySpend > 0 ? "text-green-600" : "text-destructive"
              )} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Month-end forecast</p>
              {projection ? (
                <>
                  <p className={cn(
                    "text-3xl sm:text-4xl font-bold tracking-tight mt-1 wrap-break-word",
                    projection.isOver ? "text-destructive" : "text-green-600"
                  )}>
                    {projection.isOver ? "+" : "-"}{formatCurrency(Math.abs(projection.overUnder))}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {projection.isOver
                      ? `On pace to overshoot by ${formatCurrency(projection.overUnder)}`
                      : `On pace to finish ${formatCurrency(Math.abs(projection.overUnder))} under budget`
                    }
                  </p>
                </>
              ) : (
                <>
                  <p className={cn(
                    "text-3xl sm:text-4xl font-bold tracking-tight mt-1 wrap-break-word",
                    remaining < 0 ? "text-destructive" : "text-green-600"
                  )}>
                    {formatCurrency(remaining)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    remaining of {formatCurrency(overview.flexibleBudget)} flexible budget
                  </p>
                </>
              )}
            </div>
            <div className={cn(
              "shrink-0 rounded-full p-3",
              projection && !projection.isOver
                ? "bg-green-100 dark:bg-green-950/40"
                : projection?.isOver
                  ? "bg-destructive/10"
                  : "bg-muted"
            )}>
              <Target className={cn(
                "h-6 w-6",
                projection && !projection.isOver
                  ? "text-green-600"
                  : projection?.isOver
                    ? "text-destructive"
                    : "text-muted-foreground"
              )} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetVsActualBars({ pace, spending }: {
  pace: MonthlyBudgetPace | undefined;
  spending: SpendingBreakdown | undefined;
}) {
  if (!pace || !spending) return null;

  const categoryBars = pace.categories
    .filter((cat) => cat.monthlyBudget !== null && cat.monthlyBudget > 0)
    .map((cat) => {
      const spendData = spending.byParentCategory.find((s) => s.categoryId === cat.categoryId);
      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        budget: cat.monthlyBudget!,
        actual: spendData?.spent ?? cat.actualSpendToDate,
        isOver: cat.actualSpendToDate > cat.monthlyBudget!,
      };
    })
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 6);

  if (categoryBars.length === 0) return null;

  const maxValue = Math.max(...categoryBars.map((c) => Math.max(c.budget, c.actual)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Budget vs actual</CardTitle>
        <p className="text-sm text-muted-foreground">How each budgeted category is tracking</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {categoryBars.map((cat) => {
          const budgetWidth = maxValue > 0 ? (cat.budget / maxValue) * 100 : 0;
          const actualWidth = maxValue > 0 ? (cat.actual / maxValue) * 100 : 0;
          return (
            <div key={cat.categoryId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium truncate min-w-0">{cat.categoryName}</span>
                <span className={cn(
                  "font-medium shrink-0 tabular-nums",
                  cat.isOver ? "text-destructive" : "text-muted-foreground"
                )}>
                  {formatCurrency(cat.actual)} / {formatCurrency(cat.budget)}
                </span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20"
                  style={{ width: `${budgetWidth}%` }}
                />
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all",
                    cat.isOver ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(actualWidth, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Cycle title — named after the calendar month covering most of the cycle's days.
 * A 25 Apr – 24 May cycle becomes "May 2026 cycle".
 */
function formatCycleTitle(cycleStart: string, cycleEnd: string): string {
  const start = new Date(cycleStart);
  const end = new Date(cycleEnd);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return `${mid.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} cycle`;
}

function formatCycleRange(cycleStart: string, cycleEnd: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
}

export function OverviewPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useCurrentBudgetOverview();
  // All per-month queries follow whichever cycle the backend returns as active.
  // They stay disabled until the overview lands (each hook gates on a truthy month).
  const month = overview?.month ?? "";
  const { data: spending, isLoading: spendingLoading } = useSpendingBreakdown(month);
  const { data: overspend } = useOverspendCategories(month);
  const { data: pace } = useMonthlyPace(month);

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (overviewError || !overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Overview</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No active pay cycle</h3>
            <p className="text-muted-foreground text-center mb-4">
              Set up a cycle to see your spending overview and weekly allowance.
            </p>
            <Button>Set Up Budget</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOverBudget = overview.remainingFlexible < 0;
  const budgetUsedPercent = Math.min(100, (overview.actualSpend / overview.flexibleBudget) * 100);
  const cycleTitle = formatCycleTitle(overview.cycleStart, overview.cycleEnd);
  const cycleRange = formatCycleRange(overview.cycleStart, overview.cycleEnd);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{cycleTitle}</h1>
          <p className="text-sm text-muted-foreground">{cycleRange}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{overview.daysUntilPayday} days until payday</span>
        </div>
      </div>

      {/* Monthly Status Strip - Layer 2: Use pace data if available */}
      {pace ? (
        <MonthlyStatusStrip pace={pace} daysUntilPayday={overview.daysUntilPayday} />
      ) : overspend ? (
        <MonthlyStatusStrip
          remainingFlexibleBudget={overview.remainingFlexible}
          flexibleBudget={overview.flexibleBudget}
          safeDailySpend={overview.dailyAllowance}
          overBudgetCategories={overspend.map((cat) => ({
            categoryId: cat.categoryId,
            categoryName: cat.categoryName,
            spent: cat.spent,
            budget: cat.budget!,
            remaining: cat.remaining!,
          }))}
          daysUntilPayday={overview.daysUntilPayday}
        />
      ) : (
        <MonthlyStatusStrip
          remainingFlexibleBudget={overview.remainingFlexible}
          flexibleBudget={overview.flexibleBudget}
          safeDailySpend={overview.dailyAllowance}
          overBudgetCategories={[]}
          daysUntilPayday={overview.daysUntilPayday}
        />
      )}

      {/* Daily Pulse: Safe to spend + Month-end forecast */}
      <DailyPulse pace={pace} overview={overview} />

      {/* Key Numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={cn(isOverBudget && "border-destructive")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Allowance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", isOverBudget && "text-destructive")}>
              {formatCurrency(Math.max(0, pace?.overall.weeklyAllowance ?? overview.weeklyAllowance))}
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              {formatCurrencyPrecise(Math.max(0, overview.dailyAllowance))}/day safe until payday
              <PaceExplanation type="daily" />
            </p>
            {overview.daysUntilPayday > 0 && (
              <p className="text-xs text-muted-foreground">
                {overview.daysUntilPayday} {overview.daysUntilPayday === 1 ? "day" : "days"} until payday
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining Flexible</CardTitle>
            {overview.remainingFlexible >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", overview.remainingFlexible < 0 && "text-destructive")}>
              {formatCurrency(pace?.overall.remainingFlexibleBudget ?? overview.remainingFlexible)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatCurrency(overview.flexibleBudget)} flexible budget
            </p>
            {/* Layer 2: Pace context */}
            {pace && pace.overall.paceDelta !== 0 && (
              <p className={cn(
                "text-xs font-medium inline-flex items-center gap-1",
                pace.overall.paceDelta > 0 ? "text-amber-600" : "text-green-600"
              )}>
                {pace.overall.paceDelta > 0 
                  ? `${formatCurrency(pace.overall.paceDelta)} over expected by now`
                  : `${formatCurrency(Math.abs(pace.overall.paceDelta))} under expected by now`
                }
                <PaceExplanation type="overall" />
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flexible Spend</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(pace?.overall.actualFlexibleSpendToDate ?? overview.actualSpend)}</div>
            {/* Layer 2: Expected by now context */}
            {pace ? (
              <p className="text-xs text-muted-foreground mb-2">
                Expected by now: {formatCurrency(pace.overall.expectedFlexibleSpendByNow)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-2">
                {formatCurrency(overview.actualSpend)} of {formatCurrency(overview.flexibleBudget)} used
              </p>
            )}
            <Progress 
              value={budgetUsedPercent} 
              className={cn(
                budgetUsedPercent >= 100 && "[&>div]:bg-destructive",
                budgetUsedPercent >= 85 && budgetUsedPercent < 100 && "[&>div]:bg-amber-500"
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Target</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview.savingsTarget)}</div>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget vs Actual Bars */}
      <BudgetVsActualBars pace={pace} spending={spending} />

      {/* Budget Breakdown & Main Budget Pressures */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Expected Income</span>
              <span className="font-medium">{formatCurrency(overview.expectedIncome)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Savings Target</span>
              <span className="font-medium text-amber-600">-{formatCurrency(overview.savingsTarget)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Fixed Commitments</span>
              <span className="font-medium text-amber-600">-{formatCurrency(overview.fixedCommitments)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Planned One-offs</span>
              <span className="font-medium text-amber-600">-{formatCurrency(overview.plannedOneOffs)}</span>
            </div>
            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-medium">Flexible Budget</span>
              <span className="font-bold text-lg">{formatCurrency(overview.flexibleBudget)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Already Spent</span>
              <span className="font-medium text-red-600">-{formatCurrency(overview.actualSpend)}</span>
            </div>
            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-medium">Remaining</span>
              <span className={cn("font-bold text-lg", overview.remainingFlexible < 0 ? "text-destructive" : "text-green-600")}>
                {formatCurrency(overview.remainingFlexible)}
              </span>
            </div>

            {/* Pace Comparison Block */}
            {pace && (
              <div className="border-t pt-4 mt-4 space-y-2 bg-muted/30 -mx-6 px-6 py-4 -mb-6 rounded-b-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                    Expected by now
                    <PaceExplanation type="overall" />
                  </span>
                  <span className="text-sm font-medium">
                    {formatCurrency(pace.overall.expectedFlexibleSpendByNow)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Actual spend</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(pace.overall.actualFlexibleSpendToDate)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Variance</span>
                  <span className={cn(
                    "text-sm font-semibold",
                    pace.overall.paceDelta > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {pace.overall.paceDelta > 0 
                      ? `${formatCurrency(pace.overall.paceDelta)} over`
                      : `${formatCurrency(Math.abs(pace.overall.paceDelta))} under`
                    }
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <MainBudgetPressuresCard 
          pace={pace} 
          spending={spending} 
          onCategoryClick={setSelectedCategoryId}
        />
      </div>

      {/* Category Pressure Drawer */}
      <CategoryPressureDrawer
        open={selectedCategoryId !== null}
        onOpenChange={(open) => !open && setSelectedCategoryId(null)}
        month={month}
        categoryId={selectedCategoryId}
      />

      {/* Top Categories & Merchants */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Top Categories</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs">
              View all <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {spendingLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {spending?.byParentCategory.slice(0, 5).map((cat) => (
                  <div key={cat.categoryId} className="flex justify-between items-center">
                    <span className="text-sm">{cat.categoryName}</span>
                    <span className="font-medium">{formatCurrency(cat.spent)}</span>
                  </div>
                ))}
                {(!spending?.byParentCategory || spending.byParentCategory.length === 0) && (
                  <p className="text-sm text-muted-foreground">No spending data yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Top Merchants</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs">
              View all <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {spendingLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {spending?.topMerchants.slice(0, 5).map((m) => (
                  <div key={m.merchant} className="flex justify-between items-center">
                    <div>
                      <span className="text-sm">{m.merchant}</span>
                      <span className="text-xs text-muted-foreground ml-2">({m.count}x)</span>
                    </div>
                    <span className="font-medium">{formatCurrency(m.spent)}</span>
                  </div>
                ))}
                {(!spending?.topMerchants || spending.topMerchants.length === 0) && (
                  <p className="text-sm text-muted-foreground">No spending data yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
