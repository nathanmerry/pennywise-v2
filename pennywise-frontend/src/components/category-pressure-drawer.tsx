import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryPressureDetail } from "@/hooks/use-budget";
import { PaceExplanation } from "@/components/pace-explanation";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface CategoryPressureDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  categoryId: string | null;
}

export function CategoryPressureDrawer({
  open,
  onOpenChange,
  month,
  categoryId,
}: CategoryPressureDrawerProps) {
  const { data, isLoading } = useCategoryPressureDetail(month, categoryId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "over_budget":
        return (
          <Badge className="bg-destructive text-destructive-foreground">
            Over budget
          </Badge>
        );
      case "over_pace":
        return <Badge className="bg-amber-500 text-white">Over pace</Badge>;
      case "on_track":
        return <Badge className="bg-green-500 text-white">On track</Badge>;
      case "no_budget":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            No budget
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{data.category.name}</SheetTitle>
                {getStatusBadge(data.category.status)}
              </div>
              <SheetDescription>What's driving this category</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 p-4 pt-0">
              {/* Budget Summary */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Spent</span>
                  <span className="font-semibold">
                    {formatCurrency(data.category.actualSpend)}
                  </span>
                </div>
                {data.category.monthlyBudget !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Budget</span>
                    <span className="font-medium">
                      {formatCurrency(data.category.monthlyBudget)}
                    </span>
                  </div>
                )}
                {data.category.expectedByNow !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                      Expected by now
                      <PaceExplanation type="category" />
                    </span>
                    <span className="font-medium">
                      {formatCurrency(data.category.expectedByNow)}
                    </span>
                  </div>
                )}
                {data.category.overBudgetAmount !== null && (
                  <div className="flex justify-between items-center border-t pt-3">
                    <span className="text-sm font-medium text-destructive">
                      Over budget
                    </span>
                    <span className="font-semibold text-destructive">
                      {formatCurrency(data.category.overBudgetAmount)}
                    </span>
                  </div>
                )}
                {data.category.overBudgetAmount === null &&
                  data.category.paceDelta !== null &&
                  data.category.paceDelta > 0 && (
                    <div className="flex justify-between items-center border-t pt-3">
                      <span className="text-sm font-medium text-amber-600">
                        Over pace
                      </span>
                      <span className="font-semibold text-amber-600">
                        {formatCurrency(data.category.paceDelta)}
                      </span>
                    </div>
                  )}
              </div>

              {/* Summary insight */}
              {(data.summary.dominantSubcategory || data.summary.dominantMerchant) && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  {data.summary.dominantSubcategory && (
                    <>
                      Most of this month's {data.category.name} spend is coming from{" "}
                      <span className="font-medium text-foreground">
                        {data.summary.dominantSubcategory}
                      </span>
                      .
                    </>
                  )}
                  {!data.summary.dominantSubcategory && data.summary.dominantMerchant && (
                    <>
                      <span className="font-medium text-foreground">
                        {data.summary.dominantMerchant}
                      </span>{" "}
                      accounts for a large portion of this category's spend.
                    </>
                  )}
                </p>
              )}

              {/* Subcategories */}
              {data.subcategories.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Subcategory breakdown</h3>
                  <div className="space-y-2">
                    {data.subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex justify-between items-center py-1.5"
                      >
                        <span className="text-sm">{sub.name}</span>
                        <span className="text-sm font-medium">
                          {formatCurrency(sub.spend)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Merchants */}
              {data.topMerchants.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Top merchants</h3>
                  <div className="space-y-2">
                    {data.topMerchants.map((merchant, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="text-sm truncate block">
                            {merchant.merchantName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {merchant.transactionCount} transaction
                            {merchant.transactionCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="text-sm font-medium shrink-0">
                          {formatCurrency(merchant.spend)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Largest Transactions */}
              {data.largestTransactions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Largest transactions</h3>
                  <div className="space-y-2">
                    {data.largestTransactions.map((tx) => (
                      <div
                        key={tx.transactionId}
                        className="flex justify-between items-center py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="text-sm truncate block">
                            {tx.merchantName || tx.description}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(tx.transactionDate)}
                          </span>
                        </div>
                        <span className="text-sm font-medium shrink-0">
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            Category not found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
