import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSpendingBreakdown } from "@/hooks/use-budget";
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
}

function CategoryRow({ category, childCategories, isExpanded, onToggle }: CategoryRowProps) {
  const hasChildren = childCategories && childCategories.length > 0;
  const percentUsed = category.budget ? Math.min(100, (category.spent / category.budget) * 100) : null;
  const isOverBudget = category.remaining !== null && category.remaining < 0;

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
            <span className="font-medium truncate">{category.categoryName}</span>
            <span className={cn("font-semibold", isOverBudget && "text-destructive")}>
              {formatCurrency(category.spent)}
            </span>
          </div>

          {category.budget !== null && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatCurrency(category.spent)} of {formatCurrency(category.budget)}
                </span>
                {category.remaining !== null && (
                  <span className={cn(isOverBudget ? "text-destructive" : "text-green-600")}>
                    {isOverBudget ? `${formatCurrency(Math.abs(category.remaining))} over` : `${formatCurrency(category.remaining)} left`}
                  </span>
                )}
              </div>
              <Progress
                value={percentUsed ?? 0}
                className={cn("h-2", isOverBudget && "[&>div]:bg-destructive")}
              />
            </div>
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

export function SpendingPage() {
  const [month] = useState(getCurrentMonth());
  const { data: spending, isLoading } = useSpendingBreakdown(month);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
    return spending?.byChildCategory.filter((c) => c.parentId === parentId) ?? [];
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {spending?.byParentCategory.map((category) => (
                <CategoryRow
                  key={category.categoryId}
                  category={category}
                  childCategories={getChildCategories(category.categoryId)}
                  isExpanded={expandedCategories.has(category.categoryId)}
                  onToggle={() => toggleCategory(category.categoryId)}
                />
              ))}
              {(!spending?.byParentCategory || spending.byParentCategory.length === 0) && (
                <p className="text-center text-muted-foreground py-8">No spending data for this month</p>
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
