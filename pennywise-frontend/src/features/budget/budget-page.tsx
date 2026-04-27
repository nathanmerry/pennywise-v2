import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Progress } from "@/shared/components/ui/progress";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Slider } from "@/shared/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useBudgetMonth,
  useBudgetMonths,
  useCreateBudgetMonth,
  useCreateFixedCommitment,
  useUpdateFixedCommitment,
  useDeleteFixedCommitment,
  useCreatePlannedSpend,
  useDeletePlannedSpend,
  useCreateCategoryPlan,
  useUpdateCategoryPlan,
  useDeleteCategoryPlan,
  useRecentCycles,
  useSpendingHistory,
  useUpdateBudgetMonth,
} from "@/shared/hooks/use-budget";
import { useCategories } from "@/shared/hooks/use-categories";
import { BudgetRecommendationsPanel } from "@/features/budget/components/budget-recommendations-panel";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Home,
  Pencil,
  PiggyBank,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type {
  BudgetFixedCommitment,
  BudgetMonth,
  BudgetPlannedSpend,
  BudgetCategoryPlan,
  PayCycleSummary,
} from "@/shared/lib/api";

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

function addMonthsToKey(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The pay cycle whose date range contains today, or the most recent past one. */
function findActiveCycle(cycles: PayCycleSummary[]): PayCycleSummary | null {
  if (cycles.length === 0) return null;
  const today = todayIso();
  const containing = cycles.find((c) => c.startInclusive <= today && today < c.endExclusive);
  if (containing) return containing;
  const past = cycles
    .filter((c) => c.startInclusive <= today)
    .sort((a, b) => b.startInclusive.localeCompare(a.startInclusive));
  return past[0] ?? cycles[cycles.length - 1] ?? null;
}

/**
 * Display name for a cycle, named after the calendar month covering most of its days.
 * A cycle running 25 Apr → 25 May becomes "May 2026 cycle".
 */
function getCycleDisplayName(cycle: PayCycleSummary | null, fallbackMonth: string): string {
  if (!cycle) {
    const [year, monthNum] = fallbackMonth.split("-").map(Number);
    const date = new Date(year, monthNum - 1);
    return `${date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} cycle`;
  }
  const start = new Date(cycle.startInclusive);
  const end = new Date(cycle.endExclusive);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return `${mid.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} cycle`;
}

function getCycleDateRange(cycle: PayCycleSummary): string {
  const start = new Date(cycle.startInclusive);
  const lastDay = new Date(cycle.endExclusive);
  lastDay.setDate(lastDay.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(lastDay)}`;
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

interface AddCommitmentDialogProps {
  month: string;
  onClose: () => void;
}

function AddCommitmentDialog({ month, onClose }: AddCommitmentDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const { data: categories } = useCategories();
  const createCommitment = useCreateFixedCommitment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await createCommitment.mutateAsync({
      month,
      data: {
        name,
        amount: parseFloat(amount),
        categoryId: categoryId || null,
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g., Rent, Council Tax"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount (£)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={categoryId || "none"}
          onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Link to a category (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category link</SelectItem>
            {(categories ?? [])
              .filter((category) => !category.parentId)
              .flatMap((parent) => [
                <SelectItem key={parent.id} value={parent.id}>
                  {parent.name}
                </SelectItem>,
                ...(categories ?? [])
                  .filter((category) => category.parentId === parent.id)
                  .map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {`  ${child.name}`}
                    </SelectItem>
                  )),
              ])}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Linked categories get excluded from flexible-spend pacing.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createCommitment.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

function CommitmentRow({
  commitment,
  onDelete,
}: {
  commitment: BudgetFixedCommitment;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{commitment.name}</span>
        <span className="text-xs text-muted-foreground">
          {commitment.category
            ? `Linked to ${commitment.category.name}`
            : "Not linked to a category"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">
          {formatCurrency(parseFloat(commitment.amount))}
        </span>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Fixed Commitment</DialogTitle>
            </DialogHeader>
            <EditCommitmentDialog
              commitment={commitment}
              onClose={() => setEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface EditCommitmentDialogProps {
  commitment: BudgetFixedCommitment;
  onClose: () => void;
}

function EditCommitmentDialog({ commitment, onClose }: EditCommitmentDialogProps) {
  const [name, setName] = useState(commitment.name);
  const [amount, setAmount] = useState(commitment.amount);
  const [categoryId, setCategoryId] = useState<string>(commitment.categoryId ?? "");
  const { data: categories } = useCategories();
  const updateCommitment = useUpdateFixedCommitment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await updateCommitment.mutateAsync({
      id: commitment.id,
      data: {
        name,
        amount: parseFloat(amount),
        categoryId: categoryId || null,
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-amount">Amount (£)</Label>
        <Input
          id="edit-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={categoryId || "none"}
          onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Link to a category (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category link</SelectItem>
            {(categories ?? [])
              .filter((category) => !category.parentId)
              .flatMap((parent) => [
                <SelectItem key={parent.id} value={parent.id}>
                  {parent.name}
                </SelectItem>,
                ...(categories ?? [])
                  .filter((category) => category.parentId === parent.id)
                  .map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {`  ${child.name}`}
                    </SelectItem>
                  )),
              ])}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Linked categories get excluded from flexible-spend pacing.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateCommitment.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

interface AddPlannedSpendDialogProps {
  month: string;
  onClose: () => void;
}

function AddPlannedSpendDialog({ month, onClose }: AddPlannedSpendDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [isEssential, setIsEssential] = useState(false);
  const createPlanned = useCreatePlannedSpend();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await createPlanned.mutateAsync({
      month,
      data: { name, amount: parseFloat(amount), isEssential },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g., Holiday, Birthday gift"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount (£)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="essential"
          checked={isEssential}
          onChange={(e) => setIsEssential(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="essential" className="text-sm font-normal">
          This is essential (not discretionary)
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPlanned.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

interface AddCategoryPlanDialogProps {
  month: string;
  onClose: () => void;
}

function AddCategoryPlanDialog({ month, onClose }: AddCategoryPlanDialogProps) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [targetValue, setTargetValue] = useState("");
  const [targetType, setTargetType] = useState<"fixed" | "percent">("fixed");
  const { data: categories } = useCategories();
  const createPlan = useCreateCategoryPlan();

  // Only show parent categories (top-level) for budgeting
  const parentCategories = categories?.filter((c) => !c.parentId) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !targetValue) return;

    await createPlan.mutateAsync({
      month,
      data: {
        categoryId,
        targetType,
        targetValue: parseFloat(targetValue),
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {parentCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Budget Type</Label>
        <Select value={targetType} onValueChange={(v) => setTargetType(v as "fixed" | "percent")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
            <SelectItem value="percent">Percentage of Flexible Budget</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="target">
          {targetType === "fixed" ? "Amount (£)" : "Percentage (%)"}
        </Label>
        <Input
          id="target"
          type="number"
          step={targetType === "fixed" ? "0.01" : "1"}
          placeholder={targetType === "fixed" ? "0.00" : "0"}
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPlan.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

interface CategoryPlanRowProps {
  plan: BudgetCategoryPlan;
  flexibleBudget: number;
  avgSpend: number | null;
  monthsObserved: number;
  onDelete: () => void;
}

function CategoryPlanRow({ plan, flexibleBudget, avgSpend, monthsObserved, onDelete }: CategoryPlanRowProps) {
  const persistedValue = parseFloat(plan.targetValue);
  const [value, setValue] = useState(persistedValue);
  const updatePlan = useUpdateCategoryPlan();

  useEffect(() => {
    setValue(parseFloat(plan.targetValue));
  }, [plan.targetValue]);

  const isPercent = plan.targetType === "percent";
  const sliderMax = isPercent ? 100 : Math.max(flexibleBudget > 0 ? flexibleBudget : 500, persistedValue * 1.5, 100);
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

interface EditBudgetMonthDialogProps {
  month: string;
  expectedIncome: string;
  cycleStartDate: string;
  cycleEndDate: string;
  savingsTargetType: "fixed" | "percent";
  savingsTargetValue: string;
  onClose: () => void;
}

function EditBudgetMonthDialog({
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

interface SetupBudgetFormProps {
  month: string;
  /** Optional cycle metadata so we can title the form by cycle name, not month key. */
  cycle?: PayCycleSummary | null;
  /** Previous cycle to seed defaults and offer carry-forward of commitments/plans. */
  previousBudget?: BudgetMonth | null;
}

function SetupBudgetForm({ month, cycle, previousBudget }: SetupBudgetFormProps) {
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

interface CycleNavProps {
  cycleHeading: string;
  cycleSubheading: string | null;
  isOnActive: boolean;
  activeMonthKey: string | null;
  prevMonth: string | null;
  nextMonth: string | null;
  nextIsProjected: boolean;
  onJump: (month: string) => void;
  rightSlot?: React.ReactNode;
}

function CycleNav({
  cycleHeading,
  cycleSubheading,
  isOnActive,
  activeMonthKey,
  prevMonth,
  nextMonth,
  nextIsProjected,
  onJump,
  rightSlot,
}: CycleNavProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Budget Keeper</h1>
        <p className="text-muted-foreground">
          {cycleHeading}
          {cycleSubheading && (
            <span className="text-muted-foreground/80"> · {cycleSubheading}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!prevMonth}
          onClick={() => prevMonth && onJump(prevMonth)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          variant={isOnActive ? "secondary" : "outline"}
          size="sm"
          disabled={!activeMonthKey || isOnActive}
          onClick={() => activeMonthKey && onJump(activeMonthKey)}
        >
          Current
        </Button>
        <Button
          variant={nextIsProjected ? "default" : "outline"}
          size="sm"
          disabled={!nextMonth}
          onClick={() => nextMonth && onJump(nextMonth)}
        >
          {nextIsProjected ? "Start Next Cycle" : "Next"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        {rightSlot}
      </div>
    </div>
  );
}

export function BudgetPage() {
  const { data: recentCycles, isLoading: cyclesLoading } = useRecentCycles(24);
  const { data: allBudgetMonths } = useBudgetMonths();

  const cycles = useMemo<PayCycleSummary[]>(
    () =>
      [...(recentCycles?.cycles ?? [])].sort((a, b) =>
        a.budgetMonth.localeCompare(b.budgetMonth)
      ),
    [recentCycles]
  );

  const sortedBudgetMonths = useMemo<BudgetMonth[]>(
    () =>
      [...(allBudgetMonths ?? [])].sort((a, b) => a.month.localeCompare(b.month)),
    [allBudgetMonths]
  );

  const activeCycle = useMemo(() => findActiveCycle(cycles), [cycles]);

  // User-selected override; null means follow the active cycle.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month =
    selectedMonth ??
    activeCycle?.budgetMonth ??
    cycles[cycles.length - 1]?.budgetMonth ??
    getCurrentMonth();

  const { data: budget, isLoading, error } = useBudgetMonth(month);
  const { data: spendingHistory } = useSpendingHistory(month);
  const deleteCommitment = useDeleteFixedCommitment();
  const deletePlanned = useDeletePlannedSpend();
  const deletePlan = useDeleteCategoryPlan();

  const [commitmentDialogOpen, setCommitmentDialogOpen] = useState(false);
  const [plannedDialogOpen, setPlannedDialogOpen] = useState(false);
  const [categoryPlanDialogOpen, setCategoryPlanDialogOpen] = useState(false);
  const [editMonthDialogOpen, setEditMonthDialogOpen] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const avgSpendByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    if (!spendingHistory) return map;
    for (const cat of spendingHistory.categories) {
      map.set(cat.categoryId, (map.get(cat.categoryId) ?? 0) + cat.averageMonthlySpend);
      if (cat.parentCategoryId) {
        map.set(
          cat.parentCategoryId,
          (map.get(cat.parentCategoryId) ?? 0) + cat.averageMonthlySpend
        );
      }
    }
    return map;
  }, [spendingHistory]);

  // Cycle metadata for navigation. The selected month may not yet have a cycle
  // record (when the user navigates onto a projected next cycle that doesn't exist).
  const selectedCycle = useMemo(
    () => cycles.find((c) => c.budgetMonth === month) ?? null,
    [cycles, month]
  );
  const currentCycleIndex = cycles.findIndex((c) => c.budgetMonth === month);
  const isOnExistingCycle = currentCycleIndex >= 0;
  const latestExistingMonth = cycles[cycles.length - 1]?.budgetMonth ?? null;
  const projectedNextMonth = latestExistingMonth
    ? addMonthsToKey(latestExistingMonth, 1)
    : null;

  const prevMonth: string | null = isOnExistingCycle
    ? currentCycleIndex > 0
      ? cycles[currentCycleIndex - 1].budgetMonth
      : null
    : latestExistingMonth;

  let nextMonth: string | null = null;
  let nextIsProjected = false;
  if (isOnExistingCycle) {
    if (currentCycleIndex < cycles.length - 1) {
      nextMonth = cycles[currentCycleIndex + 1].budgetMonth;
    } else if (projectedNextMonth) {
      nextMonth = projectedNextMonth;
      nextIsProjected = true;
    }
  }
  // If we're on a projected (non-existent) cycle, no further navigation forward.

  const activeMonthKey = activeCycle?.budgetMonth ?? null;
  const isOnActive = activeMonthKey !== null && month === activeMonthKey;

  const cycleHeading = selectedCycle
    ? getCycleDisplayName(selectedCycle, month)
    : getCycleDisplayName(null, month);
  const cycleSubheading = selectedCycle
    ? getCycleDateRange(selectedCycle)
    : isOnExistingCycle
    ? null
    : "Not yet started";

  if (isLoading || cyclesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Cycle doesn't exist yet — show the setup form, seeded from the most recent
  // existing cycle (before `month`) so commitments and category budgets can carry forward.
  if (error || !budget) {
    const previousBudget =
      [...sortedBudgetMonths].reverse().find((m) => m.month < month) ?? null;
    return (
      <div className="space-y-6">
        <CycleNav
          cycleHeading={cycleHeading}
          cycleSubheading={cycleSubheading}
          isOnActive={isOnActive}
          activeMonthKey={activeMonthKey}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          nextIsProjected={nextIsProjected}
          onJump={(m: string) => setSelectedMonth(m)}
        />
        <SetupBudgetForm
          month={month}
          cycle={selectedCycle}
          previousBudget={previousBudget}
        />
      </div>
    );
  }

  const totalFixed = budget.fixedCommitments.reduce(
    (sum, c) => sum + parseFloat(c.amount),
    0
  );
  const totalPlanned = budget.plannedSpends.reduce(
    (sum, s) => sum + parseFloat(s.amount),
    0
  );
  const expectedIncome = parseFloat(budget.expectedIncome);
  const savingsTarget =
    budget.savingsTargetType === "percent"
      ? expectedIncome * (parseFloat(budget.savingsTargetValue) / 100)
      : parseFloat(budget.savingsTargetValue);
  const flexibleBudget = expectedIncome - savingsTarget - totalFixed - totalPlanned;

  const totalAllocated = budget.categoryPlans.reduce((sum, plan) => {
    const value = parseFloat(plan.targetValue);
    return sum + (plan.targetType === "percent" ? flexibleBudget * (value / 100) : value);
  }, 0);
  const remainingToAllocate = flexibleBudget - totalAllocated;
  const allocationPercent = flexibleBudget > 0
    ? Math.min(100, (totalAllocated / flexibleBudget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <CycleNav
        cycleHeading={cycleHeading}
        cycleSubheading={cycleSubheading}
        isOnActive={isOnActive}
        activeMonthKey={activeMonthKey}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        nextIsProjected={nextIsProjected}
        onJump={(m: string) => setSelectedMonth(m)}
        rightSlot={
          <Dialog open={editMonthDialogOpen} onOpenChange={setEditMonthDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Cycle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit {cycleHeading}</DialogTitle>
              </DialogHeader>
              <EditBudgetMonthDialog
                month={month}
                expectedIncome={budget.expectedIncome}
                cycleStartDate={budget.cycleStartDate}
                cycleEndDate={budget.cycleEndDate}
                savingsTargetType={budget.savingsTargetType}
                savingsTargetValue={budget.savingsTargetValue}
                onClose={() => setEditMonthDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />


      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Expected Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(expectedIncome)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Savings Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(savingsTarget)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Home className="h-4 w-4" />
              Fixed + Planned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalFixed + totalPlanned)}</div>
          </CardContent>
        </Card>
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Flexible Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", flexibleBudget < 0 && "text-destructive")}>
              {formatCurrency(flexibleBudget)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="commitments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="commitments">Fixed Commitments</TabsTrigger>
          <TabsTrigger value="planned">Planned One-offs</TabsTrigger>
          <TabsTrigger value="budgets">Category Budgets</TabsTrigger>
        </TabsList>

        <TabsContent value="commitments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Fixed Commitments</CardTitle>
                <CardDescription>
                  Rent, bills, subscriptions, debt payments - things you must pay each month.
                </CardDescription>
              </div>
              <Dialog open={commitmentDialogOpen} onOpenChange={setCommitmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Fixed Commitment</DialogTitle>
                  </DialogHeader>
                  <AddCommitmentDialog
                    month={month}
                    onClose={() => setCommitmentDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {budget.fixedCommitments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No fixed commitments added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {budget.fixedCommitments.map((commitment: BudgetFixedCommitment) => (
                    <CommitmentRow
                      key={commitment.id}
                      commitment={commitment}
                      onDelete={() => deleteCommitment.mutate(commitment.id)}
                    />
                  ))}
                  <div className="flex justify-between pt-4 border-t font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalFixed)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planned">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Planned One-off Spends</CardTitle>
                <CardDescription>
                  Holiday, birthday gifts, big purchases - things you're planning this month.
                </CardDescription>
              </div>
              <Dialog open={plannedDialogOpen} onOpenChange={setPlannedDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Planned Spend</DialogTitle>
                  </DialogHeader>
                  <AddPlannedSpendDialog
                    month={month}
                    onClose={() => setPlannedDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {budget.plannedSpends.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No planned one-off spends added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {budget.plannedSpends.map((planned: BudgetPlannedSpend) => (
                    <div
                      key={planned.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <span className="font-medium">{planned.name}</span>
                        {planned.isEssential && (
                          <span className="ml-2 text-xs text-muted-foreground">(essential)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">
                          {formatCurrency(parseFloat(planned.amount))}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deletePlanned.mutate(planned.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-4 border-t font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalPlanned)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets">
          <div className="space-y-4">
            {/* AI Recommendations Panel */}
            {showRecommendations ? (
              <BudgetRecommendationsPanel
                month={month}
                onClose={() => setShowRecommendations(false)}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Get AI Budget Recommendations</p>
                        <p className="text-sm text-muted-foreground">
                          Based on your last 4 months of spending
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setShowRecommendations(true)}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Get Recommendations
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Category Budgets</CardTitle>
                  <CardDescription>
                    Set spending limits for budget groups like Eating Out, Transport, Shopping.
                  </CardDescription>
                </div>
                <Dialog open={categoryPlanDialogOpen} onOpenChange={setCategoryPlanDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Category Budget</DialogTitle>
                    </DialogHeader>
                    <AddCategoryPlanDialog
                      month={month}
                      onClose={() => setCategoryPlanDialogOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                {budget.categoryPlans.length > 0 && (
                  <div className="space-y-2 pb-2 border-b">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Allocated{" "}
                        <span className="font-semibold text-foreground">
                          {formatCurrency(totalAllocated)}
                        </span>{" "}
                        of {formatCurrency(flexibleBudget)} flexible
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          remainingToAllocate < 0 ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {remainingToAllocate < 0
                          ? `Over by ${formatCurrency(Math.abs(remainingToAllocate))}`
                          : `${formatCurrency(remainingToAllocate)} left to allocate`}
                      </span>
                    </div>
                    <Progress
                      value={allocationPercent}
                      className={cn(
                        "h-2",
                        remainingToAllocate < 0 && "*:data-[slot=progress-indicator]:bg-destructive"
                      )}
                    />
                  </div>
                )}
                {budget.categoryPlans.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No category budgets set yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...budget.categoryPlans]
                      .sort((a, b) => {
                        const nameCompare = (a.category?.name ?? "").localeCompare(b.category?.name ?? "");
                        return nameCompare !== 0 ? nameCompare : a.id.localeCompare(b.id);
                      })
                      .map((plan: BudgetCategoryPlan) => (
                      <CategoryPlanRow
                        key={plan.id}
                        plan={plan}
                        flexibleBudget={flexibleBudget}
                        avgSpend={
                          plan.categoryId
                            ? avgSpendByCategoryId.get(plan.categoryId) ?? null
                            : null
                        }
                        monthsObserved={spendingHistory?.monthsAvailable ?? 0}
                        onDelete={() => deletePlan.mutate(plan.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
