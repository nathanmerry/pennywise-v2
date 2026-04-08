import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBudgetOverview,
  useSpendingBreakdown,
  useOverspendCategories,
} from "@/hooks/use-budget";
import {
  TrendingDown,
  TrendingUp,
  Calendar,
  Wallet,
  PiggyBank,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthDisplay(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(parseInt(year), parseInt(monthNum) - 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function OverviewPage() {
  const [month] = useState(getCurrentMonth());
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useBudgetOverview(month);
  const { data: spending, isLoading: spendingLoading } = useSpendingBreakdown(month);
  const { data: overspend } = useOverspendCategories(month);

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        <h1 className="text-2xl font-bold">{formatMonthDisplay(month)}</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No budget set for this month</h3>
            <p className="text-muted-foreground text-center mb-4">
              Set up your monthly budget to see your spending overview and weekly allowance.
            </p>
            <Button>Set Up Budget</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOverBudget = overview.remainingFlexible < 0;
  const budgetUsedPercent = Math.min(100, (overview.actualSpend / overview.flexibleBudget) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{formatMonthDisplay(month)}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{overview.daysUntilPayday} days until payday</span>
        </div>
      </div>

      {/* Key Numbers - The "Am I okay?" section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={cn(isOverBudget && "border-destructive")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Allowance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", isOverBudget && "text-destructive")}>
              {formatCurrency(Math.max(0, overview.weeklyAllowance))}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrencyPrecise(Math.max(0, overview.dailyAllowance))}/day safe to spend
            </p>
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
              {formatCurrency(overview.remainingFlexible)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatCurrency(overview.flexibleBudget)} flexible budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spent This Month</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview.actualSpend)}</div>
            <Progress value={budgetUsedPercent} className="mt-2" />
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

      {/* Budget Breakdown */}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money Flow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Money In</span>
              <span className="font-medium text-green-600">+{formatCurrency(overview.moneyIn)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Money Out</span>
              <span className="font-medium text-red-600">-{formatCurrency(overview.moneyOut)}</span>
            </div>
            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-medium">Net (excl. ignored)</span>
              <span className={cn("font-bold", overview.netAfterIgnored >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(overview.netAfterIgnored)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Transfers, refunds, and other ignored transactions are excluded from the net figure.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {overspend && overspend.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Categories Over Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overspend.slice(0, 5).map((cat) => (
                <div key={cat.categoryId} className="flex justify-between items-center">
                  <span className="text-sm">{cat.categoryName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(cat.spent)} / {formatCurrency(cat.budget!)}
                    </span>
                    <Badge variant="destructive" className="text-xs">
                      {formatCurrency(Math.abs(cat.remaining!))} over
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
