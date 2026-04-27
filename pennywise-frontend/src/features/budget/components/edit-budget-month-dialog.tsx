import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useUpdateBudgetMonth } from "@/shared/hooks/use-budget";
import { isoDateOnly } from "@/features/budget/lib/cycle";

interface EditBudgetMonthDialogProps {
  month: string;
  expectedIncome: string;
  cycleStartDate: string;
  cycleEndDate: string;
  savingsTargetType: "fixed" | "percent";
  savingsTargetValue: string;
  onClose: () => void;
}

export function EditBudgetMonthDialog({
  month,
  expectedIncome: initialIncome,
  cycleStartDate: initialStart,
  cycleEndDate: initialEnd,
  savingsTargetType: initialSavingsType,
  savingsTargetValue: initialSavingsValue,
  onClose,
}: EditBudgetMonthDialogProps) {
  const [expectedIncome, setExpectedIncome] = useState(initialIncome);
  const [savingsTargetValue, setSavingsTargetValue] = useState(initialSavingsValue);
  const [savingsTargetType, setSavingsTargetType] = useState<"fixed" | "percent">(initialSavingsType);
  const [cycleStartDate, setCycleStartDate] = useState(() => isoDateOnly(initialStart));
  const [cycleEndDate, setCycleEndDate] = useState(() => isoDateOnly(initialEnd));
  const updateMonth = useUpdateBudgetMonth();

  const rangeIsInvalid = cycleStartDate && cycleEndDate && cycleEndDate < cycleStartDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedIncome || !savingsTargetValue || !cycleStartDate || !cycleEndDate) return;
    if (rangeIsInvalid) return;

    await updateMonth.mutateAsync({
      month,
      data: {
        expectedIncome: parseFloat(expectedIncome),
        cycleStartDate: new Date(cycleStartDate).toISOString(),
        cycleEndDate: new Date(cycleEndDate).toISOString(),
        savingsTargetType,
        savingsTargetValue: parseFloat(savingsTargetValue),
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-cycle-start">Cycle Start</Label>
          <Input
            id="edit-cycle-start"
            type="date"
            value={cycleStartDate}
            onChange={(e) => setCycleStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-cycle-end">Cycle End</Label>
          <Input
            id="edit-cycle-end"
            type="date"
            value={cycleEndDate}
            onChange={(e) => setCycleEndDate(e.target.value)}
          />
        </div>
      </div>
      {rangeIsInvalid && (
        <p className="text-sm text-destructive">Cycle end must be on or after cycle start.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-income">Expected Income (£)</Label>
          <Input
            id="edit-income"
            type="number"
            step="0.01"
            value={expectedIncome}
            onChange={(e) => setExpectedIncome(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Savings Target Type</Label>
          <Select value={savingsTargetType} onValueChange={(v) => setSavingsTargetType(v as "fixed" | "percent")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed Amount</SelectItem>
              <SelectItem value="percent">Percentage of Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-savings">
          Savings Target ({savingsTargetType === "fixed" ? "£" : "%"})
        </Label>
        <Input
          id="edit-savings"
          type="number"
          step={savingsTargetType === "fixed" ? "0.01" : "1"}
          value={savingsTargetValue}
          onChange={(e) => setSavingsTargetValue(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateMonth.isPending || !!rangeIsInvalid}>
          Save
        </Button>
      </div>
    </form>
  );
}
