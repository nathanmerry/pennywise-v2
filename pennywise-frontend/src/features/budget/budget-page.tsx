import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import {
  useBudgetMonth,
  useBudgetMonths,
  useDeleteFixedCommitment,
  useDeletePlannedSpend,
  useDeleteCategoryPlan,
  useRecentCycles,
  useSpendingHistory,
} from "@/shared/hooks/use-budget";
import { BudgetRecommendationsPanel } from "@/features/budget/components/budget-recommendations-panel";
import { Calendar, Home, Pencil, PiggyBank, Plus, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type {
  BudgetFixedCommitment,
  BudgetMonth,
  BudgetPlannedSpend,
  BudgetCategoryPlan,
  PayCycleSummary,
} from "@/shared/lib/api";
import {
  addMonthsToKey,
  findActiveCycle,
  formatCurrency,
  getCurrentMonth,
  getCycleDateRange,
  getCycleDisplayName,
} from "@/features/budget/lib/cycle";
import { AddCategoryPlanDialog } from "@/features/budget/components/add-category-plan-dialog";
import { AddCommitmentDialog } from "@/features/budget/components/add-commitment-dialog";
import { AddEventDialog } from "@/features/budget/components/add-event-dialog";
import { AddPlannedSpendDialog } from "@/features/budget/components/add-planned-spend-dialog";
import { AllocationSummaryBanner } from "@/features/budget/components/allocation-summary-banner";
import { CategoryPlanRow } from "@/features/budget/components/category-plan-row";
import { CommitmentRow } from "@/features/budget/components/commitment-row";
import { CycleNav } from "@/features/budget/components/cycle-nav";
import { EditBudgetMonthDialog } from "@/features/budget/components/edit-budget-month-dialog";
import { EventCard } from "@/features/budget/components/event-card";
import { SetupBudgetForm } from "@/features/budget/components/setup-budget-form";

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
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
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
  const totalEventReserves = (budget.events ?? [])
    .filter((e) => e.fundingSource === "flexible")
    .reduce((sum, e) => sum + parseFloat(e.cap), 0);
  const expectedIncome = parseFloat(budget.expectedIncome);
  const savingsTarget =
    budget.savingsTargetType === "percent"
      ? expectedIncome * (parseFloat(budget.savingsTargetValue) / 100)
      : parseFloat(budget.savingsTargetValue);
  const flexibleBudget =
    expectedIncome - savingsTarget - totalFixed - totalPlanned - totalEventReserves;

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

      <AllocationSummaryBanner month={month} />

      <Tabs defaultValue="commitments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="commitments">Fixed Commitments</TabsTrigger>
          <TabsTrigger value="planned">Planned One-offs</TabsTrigger>
          <TabsTrigger value="budgets">Category Budgets</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
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

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Events</CardTitle>
                <CardDescription>
                  Temporary spending envelopes that cut across categories — trips, weddings, big weekends.
                  Each event's cap is carved out of this cycle's flexible budget.
                </CardDescription>
              </div>
              <Sheet open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
                <SheetTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Add Event</SheetTitle>
                  </SheetHeader>
                  <div className="px-4 pb-6">
                    <AddEventDialog
                      month={month}
                      cycleStart={budget.cycleStartDate}
                      cycleEnd={budget.cycleEndDate}
                      onClose={() => setEventDialogOpen(false)}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </CardHeader>
            <CardContent>
              {budget.events.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No events added yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {budget.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
