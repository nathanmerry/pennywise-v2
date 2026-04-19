import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
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
  useCreateBudgetMonth,
  useCreateFixedCommitment,
  useUpdateFixedCommitment,
  useDeleteFixedCommitment,
  useCreatePlannedSpend,
  useDeletePlannedSpend,
  useCreateCategoryPlan,
  useUpdateCategoryPlan,
  useDeleteCategoryPlan,
  useSpendingHistory,
} from "@/shared/hooks/use-budget";
import { useCategories } from "@/shared/hooks/use-categories";
import { BudgetRecommendationsPanel } from "@/features/budget/components/budget-recommendations-panel";
import { Pencil, Plus, Trash2, Calendar, PiggyBank, Home, ShoppingBag, Sparkles, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { BudgetFixedCommitment, BudgetPlannedSpend, BudgetCategoryPlan } from "@/shared/lib/api";

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

interface SetupBudgetFormProps {
  month: string;
}

function SetupBudgetForm({ month }: SetupBudgetFormProps) {
  const [expectedIncome, setExpectedIncome] = useState("");
  const [savingsTarget, setSavingsTarget] = useState("");
  const [savingsType, setSavingsType] = useState<"fixed" | "percent">("fixed");
  const [paydayDate, setPaydayDate] = useState(() => {
    const [year, monthNum] = month.split("-").map(Number);
    return `${year}-${String(monthNum).padStart(2, "0")}-25`;
  });

  const createMonth = useCreateBudgetMonth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedIncome || !savingsTarget) return;

    await createMonth.mutateAsync({
      month,
      expectedIncome: parseFloat(expectedIncome),
      paydayDate: new Date(paydayDate).toISOString(),
      savingsTargetType: savingsType,
      savingsTargetValue: parseFloat(savingsTarget),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set Up Budget for {formatMonthDisplay(month)}</CardTitle>
        <CardDescription>
          Enter your expected income and savings target to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
            <div className="space-y-2">
              <Label htmlFor="payday">Payday Date</Label>
              <Input
                id="payday"
                type="date"
                value={paydayDate}
                onChange={(e) => setPaydayDate(e.target.value)}
              />
            </div>
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
          <Button type="submit" disabled={createMonth.isPending}>
            Create Budget
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function BudgetPage() {
  const [month] = useState(getCurrentMonth());
  const { data: budget, isLoading, error } = useBudgetMonth(month);
  const { data: spendingHistory } = useSpendingHistory(month);
  const deleteCommitment = useDeleteFixedCommitment();
  const deletePlanned = useDeletePlannedSpend();
  const deletePlan = useDeleteCategoryPlan();

  const [commitmentDialogOpen, setCommitmentDialogOpen] = useState(false);
  const [plannedDialogOpen, setPlannedDialogOpen] = useState(false);
  const [categoryPlanDialogOpen, setCategoryPlanDialogOpen] = useState(false);
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !budget) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Budget Keeper</h1>
        <SetupBudgetForm month={month} />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget Keeper</h1>
          <p className="text-muted-foreground">{formatMonthDisplay(month)}</p>
        </div>
      </div>

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
                    {budget.categoryPlans.map((plan: BudgetCategoryPlan) => (
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
