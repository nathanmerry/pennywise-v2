import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useCreateBudgetMonth,
  useCreateCategoryPlan,
  useCreateFixedCommitment,
} from "@/shared/hooks/use-budget";
import type { BudgetMonth, PayCycleSummary } from "@/shared/lib/api";
import { addDaysIso, addMonthsIso, getCycleDisplayName } from "@/features/budget/lib/cycle";

interface SetupBudgetFormProps {
  month: string;
  /** Optional cycle metadata so we can title the form by cycle name, not month key. */
  cycle?: PayCycleSummary | null;
  /** Previous cycle to seed defaults and offer carry-forward of commitments/plans. */
  previousBudget?: BudgetMonth | null;
}

export function SetupBudgetForm({ month, cycle, previousBudget }: SetupBudgetFormProps) {
  const [expectedIncome, setExpectedIncome] = useState(previousBudget?.expectedIncome ?? "");
  const [savingsTarget, setSavingsTarget] = useState(previousBudget?.savingsTargetValue ?? "");
  const [savingsType, setSavingsType] = useState<"fixed" | "percent">(
    previousBudget?.savingsTargetType ?? "fixed"
  );
  const [cycleStartDate, setCycleStartDate] = useState(() => {
    // Default new cycle's start = day after the previous cycle's end.
    if (previousBudget) return addDaysIso(previousBudget.cycleEndDate, 1);
    const [year, monthNum] = month.split("-").map(Number);
    return `${year}-${String(monthNum).padStart(2, "0")}-25`;
  });
  const [cycleEndDate, setCycleEndDate] = useState(() => {
    // Default end = ~1 month after start, minus 1 day. User adjusts as needed.
    const startSeed = previousBudget
      ? addDaysIso(previousBudget.cycleEndDate, 1)
      : (() => {
          const [year, monthNum] = month.split("-").map(Number);
          return `${year}-${String(monthNum).padStart(2, "0")}-25`;
        })();
    return addDaysIso(addMonthsIso(startSeed, 1), -1);
  });
  const [copyCommitments, setCopyCommitments] = useState(true);
  const [copyCategoryBudgets, setCopyCategoryBudgets] = useState(true);

  const createMonth = useCreateBudgetMonth();
  const createCommitmentMutation = useCreateFixedCommitment();
  const createPlanMutation = useCreateCategoryPlan();

  const cycleTitle = cycle
    ? getCycleDisplayName(cycle, month)
    : getCycleDisplayName(null, month);

  const rangeIsInvalid = cycleStartDate && cycleEndDate && cycleEndDate < cycleStartDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedIncome || !savingsTarget || !cycleStartDate || !cycleEndDate) return;
    if (rangeIsInvalid) return;

    await createMonth.mutateAsync({
      month,
      expectedIncome: parseFloat(expectedIncome),
      cycleStartDate: new Date(cycleStartDate).toISOString(),
      cycleEndDate: new Date(cycleEndDate).toISOString(),
      savingsTargetType: savingsType,
      savingsTargetValue: parseFloat(savingsTarget),
    });

    if (previousBudget) {
      const tasks: Promise<unknown>[] = [];
      if (copyCommitments) {
        for (const c of previousBudget.fixedCommitments) {
          tasks.push(
            createCommitmentMutation.mutateAsync({
              month,
              data: {
                name: c.name,
                amount: parseFloat(c.amount),
                categoryId: c.categoryId,
              },
            })
          );
        }
      }
      if (copyCategoryBudgets) {
        for (const p of previousBudget.categoryPlans) {
          if (!p.categoryId) continue;
          tasks.push(
            createPlanMutation.mutateAsync({
              month,
              data: {
                categoryId: p.categoryId,
                targetType: p.targetType,
                targetValue: parseFloat(p.targetValue),
              },
            })
          );
        }
      }
      if (tasks.length > 0) await Promise.all(tasks);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {previousBudget ? `Start ${cycleTitle}` : `Set up ${cycleTitle}`}
        </CardTitle>
        <CardDescription>
          {previousBudget
            ? "Defaults pre-filled from the previous cycle. Adjust before creating."
            : "Enter your expected income and savings target to get started."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-start">Cycle Start</Label>
              <Input
                id="cycle-start"
                type="date"
                value={cycleStartDate}
                onChange={(e) => setCycleStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-end">Cycle End</Label>
              <Input
                id="cycle-end"
                type="date"
                value={cycleEndDate}
                onChange={(e) => setCycleEndDate(e.target.value)}
              />
            </div>
          </div>
          {rangeIsInvalid && (
            <p className="text-sm text-destructive">Cycle end must be on or after cycle start.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="income">Expected Income (£)</Label>
            <Input
              id="income"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={expectedIncome}
              onChange={(e) => setExpectedIncome(e.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Savings Target Type</Label>
              <Select value={savingsType} onValueChange={(v) => setSavingsType(v as "fixed" | "percent")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                  <SelectItem value="percent">Percentage of Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="savings">
                Savings Target ({savingsType === "fixed" ? "£" : "%"})
              </Label>
              <Input
                id="savings"
                type="number"
                step={savingsType === "fixed" ? "0.01" : "1"}
                placeholder="0"
                value={savingsTarget}
                onChange={(e) => setSavingsTarget(e.target.value)}
              />
            </div>
          </div>
          {previousBudget && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Carry forward from previous cycle</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-commitments"
                  checked={copyCommitments}
                  onCheckedChange={(v) => setCopyCommitments(v === true)}
                />
                <Label htmlFor="copy-commitments" className="text-sm font-normal">
                  Copy fixed commitments ({previousBudget.fixedCommitments.length})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-budgets"
                  checked={copyCategoryBudgets}
                  onCheckedChange={(v) => setCopyCategoryBudgets(v === true)}
                />
                <Label htmlFor="copy-budgets" className="text-sm font-normal">
                  Copy category budgets ({previousBudget.categoryPlans.length})
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Planned one-offs always start fresh.
              </p>
            </div>
          )}
          <Button
            type="submit"
            disabled={
              createMonth.isPending ||
              createCommitmentMutation.isPending ||
              createPlanMutation.isPending
            }
          >
            {previousBudget ? "Start Cycle" : "Create Budget"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
