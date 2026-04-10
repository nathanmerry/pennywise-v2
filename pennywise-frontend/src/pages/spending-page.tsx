import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSpendingBreakdown, useMonthlyPace } from "@/hooks/use-budget";
import type { CategoryPace } from "@/lib/api";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategorySpend } from "@/lib/api";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

interface CategoryRowProps {
  category: CategorySpend;
  childCategories?: CategorySpend[];
  isExpanded?: boolean;
  onToggle?: () => void;
  paceData?: CategoryPace;
}

function getPaceStatusLabel(status: CategoryPace["status"]): { label: string; className: string } | null {
  switch (status) {
    case "over_budget":
      return { label: "Over budget", className: "bg-destructive text-destructive-foreground" };
    case "over_pace":
      return { label: "Over pace", className: "bg-amber-500 text-white" };
    case "on_track":
      return { label: "On track", className: "bg-green-500 text-white" };
    case "no_budget":
      return null;
  }
}

function CategoryRow({ category, childCategories, isExpanded, onToggle, paceData }: CategoryRowProps) {
  const hasChildren = childCategories && childCategories.length > 0;
  const percentUsed = category.budget ? Math.min(100, (category.spent / category.budget) * 100) : null;
  const isOverBudget = category.remaining !== null && category.remaining < 0;
  const isOverPace = paceData?.status === "over_pace";
  const paceStatus = paceData ? getPaceStatusLabel(paceData.status) : null;

  // Determine primary numeric callout and secondary context based on status
  let primaryCallout: { text: string; className: string } | null = null;
  let secondaryContext: string | null = null;

  if (paceData?.status === "over_budget" && category.remaining !== null) {
    primaryCallout = {
      text: `${formatCurrency(Math.abs(category.remaining))} over budget`,
      className: "text-destructive font-medium",
    };
    if (paceData.expectedSpendByNow !== null) {
      secondaryContext = `Expected by now: ${formatCurrency(paceData.expectedSpendByNow)}`;
    }
  } else if (paceData?.status === "over_pace" && paceData.paceDelta !== null) {
    primaryCallout = {
      text: `${formatCurrency(paceData.paceDelta)} over pace`,
      className: "text-amber-600 font-medium",
    };
    secondaryContext = `${formatCurrency(category.spent)} of ${formatCurrency(category.budget!)} budget`;
  } else if (paceData?.status === "on_track" && category.remaining !== null) {
    primaryCallout = {
      text: `${formatCurrency(category.remaining)} left`,
      className: "text-green-600 font-medium",
    };
    if (paceData.expectedSpendByNow !== null) {
      secondaryContext = `Expected by now: ${formatCurrency(paceData.expectedSpendByNow)}`;
    }
  } else if (category.budget !== null && category.remaining !== null) {
    // Fallback for categories without pace data but with budget
    if (isOverBudget) {
      primaryCallout = {
        text: `${formatCurrency(Math.abs(category.remaining))} over`,
        className: "text-destructive font-medium",
      };
    } else {
      primaryCallout = {
        text: `${formatCurrency(category.remaining)} left`,
        className: "text-green-600 font-medium",
      };
    }
    secondaryContext = `${formatCurrency(category.spent)} of ${formatCurrency(category.budget)}`;
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-colors",
          hasChildren && "cursor-pointer hover:bg-accent/50"
        )}
        onClick={hasChildren ? onToggle : undefined}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{category.categoryName}</span>
              {paceStatus && (
                <Badge className={cn("text-xs", paceStatus.className)}>
                  {paceStatus.label}
                </Badge>
              )}
            </div>
            <span className={cn("font-semibold", isOverBudget && "text-destructive")}>
              {formatCurrency(category.spent)}
            </span>
          </div>

          {category.budget !== null && (
            <div className="mt-2 space-y-1">
              {/* Primary callout - single most important number */}
              {primaryCallout && (
                <div className="flex justify-between items-center">
                  <span className={primaryCallout.className}>{primaryCallout.text}</span>
                  {secondaryContext && (
                    <span className="text-xs text-muted-foreground">{secondaryContext}</span>
                  )}
                </div>
              )}
              <Progress
                value={percentUsed ?? 0}
                className={cn(
                  "h-2", 
                  isOverBudget && "[&>div]:bg-destructive",
                  isOverPace && !isOverBudget && "[&>div]:bg-amber-500"
                )}
              />
            </div>
          )}

          {/* No budget categories - just show spend */}
          {category.budget === null && paceData?.status === "no_budget" && (
            <p className="text-xs text-muted-foreground mt-1">No budget set</p>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-8 space-y-1 border-l-2 border-muted pl-4">
          {childCategories.map((child) => (
            <div key={child.categoryId} className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">{child.categoryName}</span>
              <span className="text-sm font-medium">{formatCurrency(child.spent)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PressureFilter = "all" | "pressures" | "over_budget" | "over_pace" | "no_budget";

export function SpendingPage() {
  const [month] = useState(getCurrentMonth());
  const { data: spending, isLoading } = useSpendingBreakdown(month);
  const { data: pace } = useMonthlyPace(month);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<PressureFilter>("all");

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const getChildCategories = (parentId: string): CategorySpend[] => {
    return spending?.byChildCategory.filter((c: CategorySpend) => c.parentId === parentId) ?? [];
  };

  const getCategoryPace = (categoryId: string): CategoryPace | undefined => {
    return pace?.categories.find((c: CategoryPace) => c.categoryId === categoryId);
  };

  // Sort categories by pressure priority: over_budget > over_pace > highest spend > no_budget
  const getSortedCategories = (): CategorySpend[] => {
    if (!spending?.byParentCategory) return [];
    
    return [...spending.byParentCategory].sort((a, b) => {
      const paceA = getCategoryPace(a.categoryId);
      const paceB = getCategoryPace(b.categoryId);
      
      const getPriority = (paceData: CategoryPace | undefined): number => {
        if (!paceData) return 4;
        switch (paceData.status) {
          case "over_budget": return 0;
          case "over_pace": return 1;
          case "on_track": return 2;
          case "no_budget": return 3;
          default: return 4;
        }
      };
      
      const priorityA = getPriority(paceA);
      const priorityB = getPriority(paceB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.spent - a.spent; // Secondary sort by spend
    });
  };

  // Filter categories based on selected filter
  const getFilteredCategories = (): CategorySpend[] => {
    const sorted = getSortedCategories();
    
    if (filter === "all") return sorted;
    
    return sorted.filter((cat) => {
      const paceData = getCategoryPace(cat.categoryId);
      if (!paceData) return filter === "no_budget";
      
      switch (filter) {
        case "pressures":
          return paceData.status === "over_budget" || paceData.status === "over_pace";
        case "over_budget":
          return paceData.status === "over_budget";
        case "over_pace":
          return paceData.status === "over_pace";
        case "no_budget":
          return paceData.status === "no_budget";
        default:
          return true;
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const totalSpend = spending?.byParentCategory.reduce((sum, c) => sum + c.spent, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spending Breakdown</h1>
          <p className="text-muted-foreground">{formatMonthDisplay(month)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total Spend</p>
          <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
        </div>
      </div>

      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">By Category</TabsTrigger>
          <TabsTrigger value="merchants">By Merchant</TabsTrigger>
          <TabsTrigger value="daily">Daily Trend</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "pressures" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("pressures")}
            >
              Pressures
            </Button>
            <Button
              variant={filter === "over_budget" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("over_budget")}
              className={filter === "over_budget" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              Over budget
            </Button>
            <Button
              variant={filter === "over_pace" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("over_pace")}
              className={filter === "over_pace" ? "bg-amber-500 hover:bg-amber-500/90" : ""}
            >
              Over pace
            </Button>
            <Button
              variant={filter === "no_budget" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("no_budget")}
            >
              No budget
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {getFilteredCategories().map((category: CategorySpend) => (
                <CategoryRow
                  key={category.categoryId}
                  category={category}
                  childCategories={getChildCategories(category.categoryId)}
                  isExpanded={expandedCategories.has(category.categoryId)}
                  onToggle={() => toggleCategory(category.categoryId)}
                  paceData={getCategoryPace(category.categoryId)}
                />
              ))}
              {getFilteredCategories().length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  {filter === "all" ? "No spending data for this month" : `No categories matching "${filter.replace("_", " ")}"`}
                </p>
              )}
            </CardContent>
          </Card>

          {spending?.byBudgetGroup && spending.byBudgetGroup.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spend by Budget Group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {spending.byBudgetGroup.map((group) => {
                  const percentUsed = group.budget ? Math.min(100, (group.spent / group.budget) * 100) : null;
                  const isOverBudget = group.remaining !== null && group.remaining < 0;

                  return (
                    <div key={group.groupId} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{group.groupName}</span>
                        <span className={cn("font-semibold", isOverBudget && "text-destructive")}>
                          {formatCurrency(group.spent)}
                        </span>
                      </div>
                      {group.budget !== null && (
                        <>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Budget: {formatCurrency(group.budget)}</span>
                            {group.remaining !== null && (
                              <span className={cn(isOverBudget ? "text-destructive" : "text-green-600")}>
                                {isOverBudget
                                  ? `${formatCurrency(Math.abs(group.remaining))} over`
                                  : `${formatCurrency(group.remaining)} left`}
                              </span>
                            )}
                          </div>
                          <Progress
                            value={percentUsed ?? 0}
                            className={cn("h-2", isOverBudget && "[&>div]:bg-destructive")}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {spending?.topMerchants.map((merchant, index) => (
                  <div key={merchant.merchant} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-medium truncate">{merchant.merchant}</span>
                        <span className="font-semibold">{formatCurrency(merchant.spent)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{merchant.count} transaction{merchant.count !== 1 ? "s" : ""}</span>
                        <span>avg {formatCurrency(merchant.spent / merchant.count)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!spending?.topMerchants || spending.topMerchants.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No merchant data for this month</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Spending</CardTitle>
            </CardHeader>
            <CardContent>
              {spending?.dailySpend && spending.dailySpend.length > 0 ? (
                <div className="space-y-2">
                  {spending.dailySpend.map((day) => {
                    const maxSpend = Math.max(...spending.dailySpend.map((d) => d.spent));
                    const percent = maxSpend > 0 ? (day.spent / maxSpend) * 100 : 0;
                    const date = new Date(day.date);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                    return (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className={cn("text-xs w-20", isWeekend && "font-medium")}>
                          {date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-16 text-right">
                          {formatCurrency(day.spent)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No daily data for this month</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
