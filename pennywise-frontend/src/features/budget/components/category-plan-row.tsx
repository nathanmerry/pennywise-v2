import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Slider } from "@/shared/components/ui/slider";
import { useUpdateCategoryPlan } from "@/shared/hooks/use-budget";
import { cn } from "@/shared/lib/utils";
import type { BudgetCategoryPlan } from "@/shared/lib/api";
import { formatCurrency } from "@/features/budget/lib/cycle";

interface CategoryPlanRowProps {
  plan: BudgetCategoryPlan;
  flexibleBudget: number;
  avgSpend: number | null;
  monthsObserved: number;
  onDelete: () => void;
}

export function CategoryPlanRow({
  plan,
  flexibleBudget,
  avgSpend,
  monthsObserved,
  onDelete,
}: CategoryPlanRowProps) {
  const persistedValue = parseFloat(plan.targetValue);
  const [value, setValue] = useState(persistedValue);
  const updatePlan = useUpdateCategoryPlan();

  useEffect(() => {
    setValue(parseFloat(plan.targetValue));
  }, [plan.targetValue]);

  const isPercent = plan.targetType === "percent";
  const sliderMax = isPercent
    ? 100
    : Math.max(flexibleBudget > 0 ? flexibleBudget : 500, persistedValue * 1.5, 100);
  const sliderStep = isPercent ? 1 : 5;

  const budgetInPounds = isPercent ? flexibleBudget * (value / 100) : value;
  const diff = avgSpend !== null ? budgetInPounds - avgSpend : null;

  const commit = (next: number) => {
    const rounded = Math.max(0, Math.round(next * 100) / 100);
    if (rounded === parseFloat(plan.targetValue)) return;
    updatePlan.mutate({ id: plan.id, data: { targetValue: rounded } });
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{plan.category?.name || "Unknown"}</div>
          {avgSpend !== null ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <span>Avg {formatCurrency(avgSpend)}/mo · last {monthsObserved}mo</span>
              {diff !== null && Math.abs(diff) >= 1 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    diff < 0 ? "text-destructive" : "text-emerald-600"
                  )}
                >
                  {diff < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                  {formatCurrency(Math.abs(diff))} vs avg
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5">No spend history yet</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          value={[Math.min(value, sliderMax)]}
          min={0}
          max={sliderMax}
          step={sliderStep}
          onValueChange={(v) => setValue(v[0])}
          onValueCommit={(v) => commit(v[0])}
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          {!isPercent && <span className="text-sm text-muted-foreground">£</span>}
          <Input
            type="number"
            step={isPercent ? "1" : "0.01"}
            value={value}
            onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
            onBlur={() => commit(value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-20 h-8 text-right"
          />
          {isPercent && <span className="text-sm text-muted-foreground">%</span>}
        </div>
      </div>
    </div>
  );
}
