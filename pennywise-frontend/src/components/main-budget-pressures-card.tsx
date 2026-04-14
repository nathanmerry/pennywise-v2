import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyBudgetPace, CategorySpend } from "@/lib/api";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

type PressureStatus = "over_budget" | "over_pace" | "no_budget";

interface PressureItem {
  categoryId: string;
  categoryName: string;
  status: PressureStatus;
  amount: number;
  label: string;
  severity: number;
  budget: number | null;
  spent: number;
}

interface MainBudgetPressuresCardProps {
  pace: MonthlyBudgetPace | undefined;
  spending: { byParentCategory: CategorySpend[] } | undefined;
  onCategoryClick?: (categoryId: string) => void;
}

export function MainBudgetPressuresCard({ pace, spending, onCategoryClick }: MainBudgetPressuresCardProps) {
  const pressureItems: PressureItem[] = [];

  // Priority 1: Over-budget categories (highest severity)
  if (pace?.highlights.topOverBudgetCategories) {
    for (const cat of pace.highlights.topOverBudgetCategories) {
      pressureItems.push({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        status: "over_budget",
        amount: cat.overAmount,
        label: `${formatCurrency(cat.overAmount)} over`,
        severity: 3,
        budget: cat.monthlyBudget,
        spent: cat.actualSpendToDate,
      });
    }
  }

  // Priority 2: Over-pace categories (medium severity)
  if (pace?.highlights.topOverPaceCategories) {
    const overBudgetIds = new Set(pressureItems.map((p) => p.categoryId));
    for (const cat of pace.highlights.topOverPaceCategories) {
      if (!overBudgetIds.has(cat.categoryId)) {
        pressureItems.push({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          status: "over_pace",
          amount: cat.paceDelta,
          label: `${formatCurrency(cat.paceDelta)} ahead of pace`,
          severity: 2,
          budget: cat.monthlyBudget,
          spent: cat.actualSpendToDate,
        });
      }
    }
  }

  // Priority 3: High-spend no-budget categories (lower severity)
  if (spending?.byParentCategory && pace?.categories) {
    const existingIds = new Set(pressureItems.map((p) => p.categoryId));
    const noBudgetCategories = spending.byParentCategory
      .filter((cat) => {
        const paceData = pace.categories.find((p) => p.categoryId === cat.categoryId);
        return paceData?.status === "no_budget" && !existingIds.has(cat.categoryId) && cat.spent > 50;
      })
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3);

    for (const cat of noBudgetCategories) {
      pressureItems.push({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        status: "no_budget",
        amount: cat.spent,
        label: `${formatCurrency(cat.spent)} spent`,
        severity: 1,
        budget: null,
        spent: cat.spent,
      });
    }
  }

  // Sort by severity (highest first), then by amount
  pressureItems.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.amount - a.amount;
  });

  // Take top 3
  const topPressures = pressureItems.slice(0, 3);

  // If no pressures, show positive empty state
  if (topPressures.length === 0) {
    return (
      <Card className="border-green-500/30 bg-green-50/30 dark:bg-green-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Main Budget Pressures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No major budget pressures right now
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine card styling based on worst pressure
  const hasOverBudget = topPressures.some((p) => p.status === "over_budget");
  const hasOverPace = topPressures.some((p) => p.status === "over_pace");

  return (
    <Card
      className={cn(
        hasOverBudget && "border-destructive/30",
        !hasOverBudget && hasOverPace && "border-amber-500/30"
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              hasOverBudget && "text-destructive",
              !hasOverBudget && hasOverPace && "text-amber-500"
            )}
          />
          Main Budget Pressures
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {topPressures.map((item) => {
            const percentUsed = item.budget && item.budget > 0
              ? Math.round((item.spent / item.budget) * 100)
              : null;
            return (
              <button
                key={item.categoryId}
                type="button"
                onClick={() => onCategoryClick?.(item.categoryId)}
                className="flex flex-col gap-1.5 py-3 border-b last:border-0 w-full text-left hover:bg-accent/50 -mx-2 px-2 rounded transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate max-w-full">
                      {item.categoryName}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0",
                        item.status === "over_budget" &&
                          "border-destructive/50 text-destructive",
                        item.status === "over_pace" &&
                          "border-amber-500/50 text-amber-600",
                        item.status === "no_budget" &&
                          "border-muted-foreground/50 text-muted-foreground"
                      )}
                    >
                      {item.status === "over_budget" && "Over budget"}
                      {item.status === "over_pace" && "Over pace"}
                      {item.status === "no_budget" && "No budget"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        item.status === "over_budget" && "text-destructive",
                        item.status === "over_pace" && "text-amber-600",
                        item.status === "no_budget" && "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {item.budget !== null && percentUsed !== null && (
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.min(percentUsed, 100)}
                      className={cn(
                        "h-1.5 flex-1",
                        percentUsed >= 100 && "[&>div]:bg-destructive",
                        percentUsed >= 80 && percentUsed < 100 && "[&>div]:bg-amber-500"
                      )}
                    />
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {formatCurrency(item.spent)} / {formatCurrency(item.budget)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
