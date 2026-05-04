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
import { Calendar, Wallet, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { MonthlyStatusStrip } from "@/features/overview/components/monthly-status-strip";
import { PaceExplanation } from "@/features/overview/components/pace-explanation";
import { MainBudgetPressuresCard } from "@/features/overview/components/main-budget-pressures-card";
import { CategoryPressureDrawer } from "@/features/overview/components/category-pressure-drawer";
import { EventsSummaryCard } from "@/features/overview/components/events-summary-card";

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
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

  const cycleTitle = formatCycleTitle(overview.cycleStart, overview.cycleEnd);
  const cycleRange = formatCycleRange(overview.cycleStart, overview.cycleEnd);

  // Pick a single source of truth so the labels can't disagree. Pace's flexibleBudget
  // doesn't subtract event reserves; overview's does. Mixing them was producing
  // "£1,002 of £508" — keep the trio (budget, spent, remaining) from one source.
  const flexibleBudget = pace?.overall.flexibleBudget ?? overview.flexibleBudget;
  const flexibleSpend = pace?.overall.actualFlexibleSpendToDate ?? overview.actualSpend;
  const remainingFlexible = pace?.overall.remainingFlexibleBudget ?? overview.remainingFlexible;
  const expectedByNow = pace?.overall.expectedFlexibleSpendByNow ?? null;
  const safeDailySpend = pace?.overall.safeDailySpend ?? overview.dailyAllowance;
  const aheadOfPace = pace && pace.overall.paceDelta > 0 ? pace.overall.paceDelta : 0;

  const budgetUsedPercent = flexibleBudget > 0
    ? Math.min(100, (flexibleSpend / flexibleBudget) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{cycleTitle}</h1>
          <p className="text-sm text-muted-foreground">{cycleRange}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{overview.daysUntilPayday} {overview.daysUntilPayday === 1 ? "day" : "days"} left</span>
        </div>
      </div>

      {/* Hero: am I okay? */}
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

      {/* What can I spend today? */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <p className="text-sm font-medium text-muted-foreground">Safe to spend today</p>
          <p className={cn(
            "text-4xl font-bold tracking-tight mt-1 wrap-break-word",
            safeDailySpend <= 0 && "text-destructive"
          )}>
            {formatCurrencyPrecise(Math.max(0, safeDailySpend))}
          </p>
          {aheadOfPace > 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              Capped low — you're already {formatCurrency(aheadOfPace)} ahead of pace.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">
              {formatCurrency(Math.max(0, remainingFlexible))} left over {overview.daysUntilPayday} {overview.daysUntilPayday === 1 ? "day" : "days"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Flexible budget — the single place spend-vs-budget lives. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Flexible budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {formatCurrency(flexibleSpend)}
              <span className="text-base font-normal text-muted-foreground"> / {formatCurrency(flexibleBudget)}</span>
            </span>
            <span className={cn(
              "text-sm font-medium tabular-nums",
              remainingFlexible < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {remainingFlexible < 0
                ? `${formatCurrency(Math.abs(remainingFlexible))} over`
                : `${formatCurrency(remainingFlexible)} left`}
            </span>
          </div>
          <Progress
            value={budgetUsedPercent}
            className={cn(
              budgetUsedPercent >= 100 && "[&>div]:bg-destructive",
              budgetUsedPercent >= 85 && budgetUsedPercent < 100 && "[&>div]:bg-amber-500"
            )}
          />
          {expectedByNow !== null && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              Expected by now: {formatCurrency(expectedByNow)}
              <PaceExplanation type="overall" />
            </p>
          )}
        </CardContent>
      </Card>

      {/* What's causing the problem? */}
      <MainBudgetPressuresCard
        pace={pace}
        spending={spending}
        onCategoryClick={setSelectedCategoryId}
      />

      <EventsSummaryCard month={month} />

      <CategoryPressureDrawer
        open={selectedCategoryId !== null}
        onOpenChange={(open) => !open && setSelectedCategoryId(null)}
        month={month}
        categoryId={selectedCategoryId}
      />

      {/* Where the money goes (planning view) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Expected income</span>
            <span className="font-medium tabular-nums">{formatCurrency(overview.expectedIncome)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Savings target</span>
            <span className="font-medium text-amber-600 tabular-nums">-{formatCurrency(overview.savingsTarget)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Fixed commitments</span>
            <span className="font-medium text-amber-600 tabular-nums">-{formatCurrency(overview.fixedCommitments)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Planned one-offs</span>
            <span className="font-medium text-amber-600 tabular-nums">-{formatCurrency(overview.plannedOneOffs)}</span>
          </div>
          {overview.events > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Event reserves</span>
              <span className="font-medium text-amber-600 tabular-nums">-{formatCurrency(overview.events)}</span>
            </div>
          )}
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="font-medium">Flexible budget</span>
            <span className="font-bold text-lg tabular-nums">{formatCurrency(overview.flexibleBudget)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Top Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top categories</CardTitle>
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
                  <span className="text-sm truncate min-w-0 pr-2">{cat.categoryName}</span>
                  <span className="font-medium tabular-nums shrink-0">{formatCurrency(cat.spent)}</span>
                </div>
              ))}
              {(!spending?.byParentCategory || spending.byParentCategory.length === 0) && (
                <p className="text-sm text-muted-foreground">No spending data yet</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Merchants */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top merchants</CardTitle>
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
                <div key={m.merchant} className="flex justify-between items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{m.merchant}</div>
                    <div className="text-xs text-muted-foreground">{m.count}x</div>
                  </div>
                  <span className="font-medium tabular-nums shrink-0">{formatCurrency(m.spent)}</span>
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
  );
}
