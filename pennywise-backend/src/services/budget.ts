import { prisma } from "../lib/prisma.js";
import { effectiveAmount } from "../lib/effective-amount.js";
import { getCyclePaceContext, getPayCycleFromBudgetMonth } from "./cycle.js";
import { buildCategoryAncestryMap } from "./reporting/category-attribution.js";
import {
  getReportableOutflows,
  getCategoryResolvedOutflows,
} from "./reporting/reportable-transactions.js";
import { getCategoryBudgetRoleMap } from "./reporting/budget-role.js";

export interface BudgetOverview {
  month: string;
  expectedIncome: number;
  /** First day of the pay cycle (inclusive) — typically the user's payday. */
  cycleStart: Date;
  /** Last day of the pay cycle (inclusive) — day before the next payday. */
  cycleEnd: Date;
  daysInCycle: number;
  daysElapsed: number;
  daysRemaining: number;
  savingsTarget: number;
  fixedCommitments: number;
  plannedOneOffs: number;
  /** Sum of caps for flexible-funded events — carved out of flexibleBudget at planning time. */
  events: number;
  flexibleBudget: number;
  /** flexibleBudget minus resolved category plan totals. Negative = overcommitted. */
  unallocated: number;
  actualSpend: number;
  remainingFlexible: number;
  /** Days remaining in the current cycle (kept name for UI compatibility). */
  daysUntilPayday: number;
  weeksUntilPayday: number;
  weeklyAllowance: number;
  dailyAllowance: number;
  moneyIn: number;
  moneyOut: number;
  netAfterIgnored: number;
}

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  budgetGroupId: string | null;
  budgetGroupName: string | null;
  spent: number;
  budget: number | null;
  remaining: number | null;
  percentUsed: number | null;
}

export interface SpendingBreakdown {
  byParentCategory: CategorySpend[];
  byChildCategory: CategorySpend[];
  byBudgetGroup: { groupId: string; groupName: string; spent: number; budget: number | null; remaining: number | null }[];
  topMerchants: { merchant: string; spent: number; count: number }[];
  dailySpend: { date: string; spent: number }[];
}

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

function getMonthDateRange(month: string): { start: Date; end: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function getBudgetOverview(month: string): Promise<BudgetOverview | null> {
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: {
      fixedCommitments: true,
      plannedSpends: true,
      categoryPlans: true,
      events: true,
    },
  });

  if (!budgetMonth) return null;

  // Overview is scoped to this BudgetMonth's stored cycle, not a calendar month.
  // Transaction queries use [cycleStart, cycleEnd+1) to avoid boundary overlap.
  const now = new Date();
  const cycle = getPayCycleFromBudgetMonth(
    {
      month: budgetMonth.month,
      cycleStartDate: new Date(budgetMonth.cycleStartDate),
      cycleEndDate: new Date(budgetMonth.cycleEndDate),
    },
    now,
  );

  // Get all non-ignored transactions for the cycle, including their categories
  // so we can split spend between fixed and flexible.
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: cycle.startInclusive, lt: cycle.endExclusive },
      isIgnored: false,
    },
    select: {
      amount: true,
      categories: {
        where: { source: { not: "inherited" } },
        select: { categoryId: true },
      },
    },
  });

  // Get all transactions (including ignored) for money in/out totals
  const allTransactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: cycle.startInclusive, lt: cycle.endExclusive },
    },
    select: { amount: true, isIgnored: true },
  });

  // Calculate totals
  const expectedIncome = toNumber(budgetMonth.expectedIncome);
  
  // Savings target: fixed or percentage of income
  let savingsTarget: number;
  if (budgetMonth.savingsTargetType === "percent") {
    savingsTarget = expectedIncome * (toNumber(budgetMonth.savingsTargetValue) / 100);
  } else {
    savingsTarget = toNumber(budgetMonth.savingsTargetValue);
  }

  const fixedCommitments = budgetMonth.fixedCommitments.reduce(
    (sum, c) => sum + toNumber(c.amount),
    0
  );

  const plannedOneOffs = budgetMonth.plannedSpends.reduce(
    (sum, s) => sum + toNumber(s.amount),
    0
  );

  // Events with funding="flexible" are carved out of flexible at planning time
  // so categories can't double-budget the same money. Other funding sources
  // (savings/external) come from money outside the cycle and don't reduce flexible.
  const events = budgetMonth.events
    .filter((e) => e.fundingSource === "flexible")
    .reduce((sum, e) => sum + toNumber(e.cap), 0);

  const flexibleBudget = expectedIncome - savingsTarget - fixedCommitments - plannedOneOffs - events;

  // Resolved category plan totals: percent plans float against the post-event flexibleBudget.
  const categoryAllocated = budgetMonth.categoryPlans.reduce((sum, plan) => {
    const value = toNumber(plan.targetValue);
    return sum + (plan.targetType === "percent" ? flexibleBudget * (value / 100) : value);
  }, 0);
  const unallocated = flexibleBudget - categoryAllocated;

  // Source of truth for fixed/flexible classification — shared with pace and
  // spending-analysis so the three views can't drift on which categories are
  // pre-allocated at planning time.
  const ancestryMap = await buildCategoryAncestryMap();
  const roleMap = await getCategoryBudgetRoleMap(month, ancestryMap);

  // Split spend into flexible vs fixed. We keep the raw outflow sum here
  // (rather than using getCategoryResolvedOutflows) so `actualSpend` stays a
  // true total — multi-cat-ambiguous txs would otherwise be silently dropped
  // by the resolver and the "Already Spent" headline wouldn't tally with the
  // user's statement.
  let actualSpend = 0;
  let actualFlexibleSpend = 0;
  for (const tx of transactions) {
    const amount = effectiveAmount(tx);
    if (amount >= 0) continue;
    const abs = Math.abs(amount);
    actualSpend += abs;
    const isFixed = tx.categories.some((c) => roleMap.get(c.categoryId) === "fixed");
    if (!isFixed) actualFlexibleSpend += abs;
  }

  const remainingFlexible = flexibleBudget - actualFlexibleSpend;

  // Days/weeks until payday — use the cycle's remaining days (payday-inclusive cycle).
  const daysUntilPayday = cycle.daysRemaining;
  const weeksUntilPayday = daysUntilPayday / 7;

  // Weekly/daily allowance based on remaining time in cycle.
  const weeklyAllowance = weeksUntilPayday > 0 ? remainingFlexible / weeksUntilPayday : remainingFlexible;
  const dailyAllowance = daysUntilPayday > 0 ? remainingFlexible / daysUntilPayday : remainingFlexible;

  // Money in/out (all transactions)
  const moneyIn = allTransactions
    .filter((t) => effectiveAmount(t) > 0)
    .reduce((sum, t) => sum + effectiveAmount(t), 0);

  const moneyOut = allTransactions
    .filter((t) => effectiveAmount(t) < 0)
    .reduce((sum, t) => sum + Math.abs(effectiveAmount(t)), 0);

  // Net after ignored = only non-ignored transactions
  const netAfterIgnored = transactions.reduce((sum, t) => sum + effectiveAmount(t), 0);

  return {
    month,
    expectedIncome,
    cycleStart: cycle.cycleStartDate,
    cycleEnd: cycle.cycleEndDate,
    daysInCycle: cycle.daysInCycle,
    daysElapsed: cycle.daysElapsed,
    daysRemaining: cycle.daysRemaining,
    savingsTarget,
    fixedCommitments,
    plannedOneOffs,
    events,
    flexibleBudget,
    unallocated,
    actualSpend,
    remainingFlexible,
    daysUntilPayday,
    weeksUntilPayday,
    weeklyAllowance,
    dailyAllowance,
    moneyIn,
    moneyOut,
    netAfterIgnored,
  };
}

export interface EventPotWithSpend {
  id: string;
  eventId: string;
  name: string;
  amount: number;
  categoryId: string | null;
  category: { id: string; name: string; color: string | null; parentId: string | null } | null;
  sortOrder: number;
  /** null when no categoryId — pots without a category can't be tracked individually. */
  actualSpend: number | null;
}

export interface EventWithSpend {
  id: string;
  budgetMonthId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  cap: number;
  fundingSource: string;
  includeAllSpend: boolean;
  notes: string | null;
  pots: EventPotWithSpend[];
  /** Sum of negative tx amounts in the event's date range (excluding ignored). */
  actualSpend: number;
}

/**
 * Return all events for a budget month with computed actual spend per event and per pot.
 * Spend is currently date-range only (no transaction-event tagging) — see plan.
 */
export async function getEventsForMonth(month: string): Promise<EventWithSpend[]> {
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    select: { id: true },
  });
  if (!budgetMonth) return [];

  const events = await prisma.budgetEvent.findMany({
    where: { budgetMonthId: budgetMonth.id },
    orderBy: { startDate: "asc" },
    include: {
      pots: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { category: true },
      },
    },
  });

  return Promise.all(events.map(async (event) => {
    const rangeEnd = new Date(event.endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const transactions = await prisma.transaction.findMany({
      where: {
        transactionDate: { gte: event.startDate, lt: rangeEnd },
        isIgnored: false,
        amount: { lt: 0 },
      },
      select: {
        amount: true,
        updatedTransactionAmount: true,
        categories: {
          where: { source: { not: "inherited" } },
          select: { categoryId: true },
        },
      },
    });

    const actualSpend = transactions.reduce(
      (sum, tx) => sum + Math.abs(effectiveAmount(tx)),
      0,
    );

    const pots: EventPotWithSpend[] = event.pots.map((pot) => {
      let potSpend: number | null = null;
      if (pot.categoryId) {
        potSpend = transactions.reduce((sum, tx) => {
          const matches = tx.categories.some((c) => c.categoryId === pot.categoryId);
          return sum + (matches ? Math.abs(effectiveAmount(tx)) : 0);
        }, 0);
      }
      return {
        id: pot.id,
        eventId: pot.eventId,
        name: pot.name,
        amount: toNumber(pot.amount),
        categoryId: pot.categoryId,
        category: pot.category
          ? {
              id: pot.category.id,
              name: pot.category.name,
              color: pot.category.color,
              parentId: pot.category.parentId,
            }
          : null,
        sortOrder: pot.sortOrder,
        actualSpend: potSpend,
      };
    });

    return {
      id: event.id,
      budgetMonthId: event.budgetMonthId,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      cap: toNumber(event.cap),
      fundingSource: event.fundingSource,
      includeAllSpend: event.includeAllSpend,
      notes: event.notes,
      pots,
      actualSpend,
    };
  }));
}

export async function getSpendingBreakdown(month: string): Promise<SpendingBreakdown> {
  // Phase 1: cycle-scoped breakdown. Falls back to calendar month bounds if the
  // BudgetMonth hasn't been seeded (e.g. caller passed a month key without data).
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: { categoryPlans: true },
  });
  const { startDate, endDate } = budgetMonth
    ? (() => {
        const cycle = getPayCycleFromBudgetMonth(
          {
            month: budgetMonth.month,
            cycleStartDate: new Date(budgetMonth.cycleStartDate),
            cycleEndDate: new Date(budgetMonth.cycleEndDate),
          },
          new Date(),
        );
        // Cycle range was historically queried with `lt endExclusive`; convert
        // to an inclusive endDate by stepping back 1ms so the reporting helpers
        // (which use `lte`) return the same set.
        return { startDate: cycle.startInclusive, endDate: new Date(cycle.endExclusive.getTime() - 1) };
      })()
    : (() => {
        const { start, end } = getMonthDateRange(month);
        return { startDate: start, endDate: end };
      })();

  const ancestryMap = await buildCategoryAncestryMap();
  // outflows: every non-ignored outflow — including uncategorised and
  // ambiguous ones. Drives daily/merchant rollups so the headline totals
  // match the bank statement.
  // resolvedTransactions: only those with a single safe category. Drives the
  // category buckets where attributing to a specific bucket is required.
  const txFilters = { startDate, endDate, includeIgnored: false };
  const [outflows, resolvedTransactions] = await Promise.all([
    getReportableOutflows(txFilters, ancestryMap),
    getCategoryResolvedOutflows(txFilters, ancestryMap),
  ]);

  // Build category -> budget group map (group can live at any level of the tree).
  const budgetGroups = await prisma.budgetGroup.findMany({
    include: { categoryMappings: { select: { categoryId: true } } },
  });
  const categoryToBudgetGroup = new Map<string, { id: string; name: string }>();
  for (const group of budgetGroups) {
    for (const mapping of group.categoryMappings) {
      categoryToBudgetGroup.set(mapping.categoryId, { id: group.id, name: group.name });
    }
  }

  // Aggregations: parent buckets are keyed by root category (so deep hierarchies
  // collapse into the user's top-level category, matching Spending Analysis).
  const parentSpend = new Map<string, { name: string; spent: number }>();
  const childSpend = new Map<
    string,
    { name: string; parentId: string | null; parentName: string | null; spent: number }
  >();
  const groupSpend = new Map<string, { name: string; spent: number }>();
  const merchantSpend = new Map<string, { spent: number; count: number }>();
  const dailySpend = new Map<string, number>();

  // Daily + merchant totals run against ALL outflows so uncategorised txs
  // still show up in the time series and merchant leaderboard.
  for (const tx of outflows) {
    dailySpend.set(tx.transactionDateKey, (dailySpend.get(tx.transactionDateKey) || 0) + tx.amount);

    const merchant = tx.normalizedMerchant || tx.merchantName || tx.description;
    if (merchant) {
      const existing = merchantSpend.get(merchant) || { spent: 0, count: 0 };
      merchantSpend.set(merchant, { spent: existing.spent + tx.amount, count: existing.count + 1 });
    }
  }

  // Category buckets only count txs that resolve to a single safe category.
  for (const tx of resolvedTransactions) {
    // Parent (root) category aggregation
    const existingParent = parentSpend.get(tx.rootCategoryId) || { name: tx.rootCategoryName, spent: 0 };
    parentSpend.set(tx.rootCategoryId, { ...existingParent, spent: existingParent.spent + tx.amount });

    // Child category aggregation — only when the resolved category isn't itself a root.
    if (tx.categoryId !== tx.rootCategoryId) {
      const node = ancestryMap.get(tx.categoryId);
      const parent = node?.parentId ? ancestryMap.get(node.parentId) : null;
      const existingChild = childSpend.get(tx.categoryId) || {
        name: node?.name ?? "Uncategorised",
        parentId: node?.parentId ?? null,
        parentName: parent?.name ?? null,
        spent: 0,
      };
      childSpend.set(tx.categoryId, { ...existingChild, spent: existingChild.spent + tx.amount });
    }

    // Budget group: walk from the resolved category up to the root, taking the
    // first ancestor with a group mapping. Matches the historical "self or
    // immediate parent" lookup but extends naturally to deeper trees.
    let groupCursor: string | null = tx.categoryId;
    while (groupCursor) {
      const group = categoryToBudgetGroup.get(groupCursor);
      if (group) {
        const existingGroup = groupSpend.get(group.id) || { name: group.name, spent: 0 };
        groupSpend.set(group.id, { ...existingGroup, spent: existingGroup.spent + tx.amount });
        break;
      }
      groupCursor = ancestryMap.get(groupCursor)?.parentId ?? null;
    }
  }

  // Build budget maps from the budgetMonth already loaded above.
  const categoryBudgets = new Map<string, number>();
  const groupBudgets = new Map<string, number>();

  if (budgetMonth) {
    for (const plan of budgetMonth.categoryPlans) {
      const budget = toNumber(plan.targetValue);
      if (plan.categoryId) {
        categoryBudgets.set(plan.categoryId, budget);
      }
      if (plan.budgetGroupId) {
        groupBudgets.set(plan.budgetGroupId, budget);
      }
    }
  }

  // Build response
  const byParentCategory: CategorySpend[] = Array.from(parentSpend.entries()).map(([id, data]) => {
    const budget = categoryBudgets.get(id) ?? null;
    return {
      categoryId: id,
      categoryName: data.name,
      parentId: null,
      parentName: null,
      budgetGroupId: categoryToBudgetGroup.get(id)?.id || null,
      budgetGroupName: categoryToBudgetGroup.get(id)?.name || null,
      spent: data.spent,
      budget,
      remaining: budget !== null ? budget - data.spent : null,
      percentUsed: budget !== null && budget > 0 ? (data.spent / budget) * 100 : null,
    };
  }).sort((a, b) => b.spent - a.spent);

  const byChildCategory: CategorySpend[] = Array.from(childSpend.entries()).map(([id, data]) => {
    const budget = categoryBudgets.get(id) ?? null;
    return {
      categoryId: id,
      categoryName: data.name,
      parentId: data.parentId,
      parentName: data.parentName,
      budgetGroupId: categoryToBudgetGroup.get(id)?.id || null,
      budgetGroupName: categoryToBudgetGroup.get(id)?.name || null,
      spent: data.spent,
      budget,
      remaining: budget !== null ? budget - data.spent : null,
      percentUsed: budget !== null && budget > 0 ? (data.spent / budget) * 100 : null,
    };
  }).sort((a, b) => b.spent - a.spent);

  const byBudgetGroup = Array.from(groupSpend.entries()).map(([id, data]) => {
    const budget = groupBudgets.get(id) ?? null;
    return {
      groupId: id,
      groupName: data.name,
      spent: data.spent,
      budget,
      remaining: budget !== null ? budget - data.spent : null,
    };
  }).sort((a, b) => b.spent - a.spent);

  const topMerchants = Array.from(merchantSpend.entries())
    .map(([merchant, data]) => ({ merchant, ...data }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 20);

  const dailySpendArray = Array.from(dailySpend.entries())
    .map(([date, spent]) => ({ date, spent }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    byParentCategory,
    byChildCategory,
    byBudgetGroup,
    topMerchants,
    dailySpend: dailySpendArray,
  };
}

export async function getCategoriesOverBudget(month: string): Promise<CategorySpend[]> {
  const breakdown = await getSpendingBreakdown(month);
  return breakdown.byParentCategory.filter(
    (c) => c.budget !== null && c.remaining !== null && c.remaining < 0
  );
}

export async function getProjectedOverspend(month: string): Promise<CategorySpend[]> {
  const overview = await getBudgetOverview(month);
  if (!overview) return [];

  const breakdown = await getSpendingBreakdown(month);
  const { start, end } = getMonthDateRange(month);
  const now = new Date();
  
  // Calculate days elapsed and total days in month
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  
  // Project spend to end of month
  return breakdown.byParentCategory
    .filter((c) => c.budget !== null)
    .map((c) => {
      const projectedSpend = (c.spent / daysElapsed) * totalDays;
      const projectedRemaining = c.budget! - projectedSpend;
      return { ...c, projectedSpend, projectedRemaining };
    })
    .filter((c) => c.projectedRemaining < 0);
}

// ============================================================================
// MONTHLY PACE SERVICE - Layer 2
// ============================================================================

export type OverallPaceStatus = "on_track" | "over_pace" | "over_budget" | "overspent";
export type CategoryPaceStatus = "on_track" | "over_pace" | "over_budget" | "no_budget";

export interface CategoryPace {
  categoryId: string;
  categoryName: string;
  monthlyBudget: number | null;
  actualSpendToDate: number;
  expectedSpendByNow: number | null;
  paceDelta: number | null;
  remainingBudget: number | null;
  status: CategoryPaceStatus;
}

export interface MonthlyBudgetPace {
  month: string;
  totalDaysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedRatio: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;

  overall: {
    flexibleBudget: number;
    actualFlexibleSpendToDate: number;
    expectedFlexibleSpendByNow: number;
    paceDelta: number;
    remainingFlexibleBudget: number;
    safeDailySpend: number;
    weeklyAllowance: number;
    status: OverallPaceStatus;
    fixedPlanned: number;
    actualFixedSpendToDate: number;
  };

  /** Linear month-end projection from the current burn rate. */
  forecast: {
    projectedFlexibleSpend: number;
    projectedOverUnder: number;
    isProjectedOver: boolean;
  };

  categories: CategoryPace[];

  highlights: {
    topOverPaceCategories: Array<{
      categoryId: string;
      categoryName: string;
      actualSpendToDate: number;
      monthlyBudget: number;
      expectedSpendByNow: number;
      paceDelta: number;
    }>;
    topOverBudgetCategories: Array<{
      categoryId: string;
      categoryName: string;
      actualSpendToDate: number;
      monthlyBudget: number;
      overAmount: number;
    }>;
  };
}

function getMonthPaceContext(month: string): {
  totalDaysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedRatio: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;
} {
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0); // Last day of month
  const totalDaysInMonth = monthEnd.getDate();
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const isCurrentMonth = year === currentYear && monthNum === currentMonth;
  const isPastMonth = year < currentYear || (year === currentYear && monthNum < currentMonth);
  const isFutureMonth = year > currentYear || (year === currentYear && monthNum > currentMonth);
  
  let elapsedDays: number;
  if (isCurrentMonth) {
    elapsedDays = now.getDate();
  } else if (isPastMonth) {
    elapsedDays = totalDaysInMonth;
  } else {
    elapsedDays = 0;
  }
  
  const remainingDays = totalDaysInMonth - elapsedDays;
  const elapsedRatio = elapsedDays / totalDaysInMonth;
  
  return {
    totalDaysInMonth,
    elapsedDays,
    remainingDays,
    elapsedRatio,
    isCurrentMonth,
    isPastMonth,
    isFutureMonth,
  };
}

// ============================================================================
// CATEGORY PRESSURE DETAIL - Layer 4
// ============================================================================

export interface CategoryPressureDetail {
  month: string;
  category: {
    id: string;
    name: string;
    status: CategoryPaceStatus;
    actualSpend: number;
    monthlyBudget: number | null;
    expectedByNow: number | null;
    paceDelta: number | null;
    overBudgetAmount: number | null;
  };
  subcategories: Array<{
    id: string;
    name: string;
    spend: number;
  }>;
  topMerchants: Array<{
    merchantName: string;
    spend: number;
    transactionCount: number;
  }>;
  largestTransactions: Array<{
    transactionId: string;
    transactionDate: string;
    merchantName: string | null;
    description: string;
    amount: number;
  }>;
  summary: {
    dominantSubcategory: string | null;
    dominantMerchant: string | null;
  };
}

export async function getCategoryPressureDetail(
  month: string,
  categoryId: string
): Promise<CategoryPressureDetail | null> {
  // Get the category
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { children: true },
  });

  if (!category) return null;

  // Get budget for this category
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: {
      categoryPlans: {
        where: { categoryId },
      },
    },
  });

  if (!budgetMonth) return null;

  // Cycle-scoped pressure view.
  const cycle = getPayCycleFromBudgetMonth(
    {
      month: budgetMonth.month,
      cycleStartDate: new Date(budgetMonth.cycleStartDate),
      cycleEndDate: new Date(budgetMonth.cycleEndDate),
    },
    new Date(),
  );
  const paceContext = getCyclePaceContext(cycle);

  const monthlyBudget = budgetMonth?.categoryPlans[0]
    ? toNumber(budgetMonth.categoryPlans[0].targetValue)
    : null;

  // Get all transactions for this category and its children
  const categoryIds = [categoryId, ...category.children.map((c) => c.id)];

  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: cycle.startInclusive, lt: cycle.endExclusive },
      isIgnored: false,
      amount: { lt: 0 },
      categories: {
        some: {
          categoryId: { in: categoryIds },
        },
      },
    },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
    orderBy: { amount: "asc" }, // Most negative (largest spend) first
  });

  // Calculate actual spend
  const actualSpend = transactions.reduce(
    (sum, t) => sum + Math.abs(effectiveAmount(t)),
    0
  );

  // Calculate pace metrics
  const expectedByNow = monthlyBudget !== null 
    ? monthlyBudget * paceContext.elapsedRatio 
    : null;
  const paceDelta = expectedByNow !== null 
    ? actualSpend - expectedByNow 
    : null;
  const overBudgetAmount = monthlyBudget !== null && actualSpend > monthlyBudget
    ? actualSpend - monthlyBudget
    : null;

  // Determine status
  let status: CategoryPaceStatus;
  if (monthlyBudget === null) {
    status = "no_budget";
  } else if (actualSpend > monthlyBudget) {
    status = "over_budget";
  } else if (paceDelta !== null && paceDelta > 0) {
    status = "over_pace";
  } else {
    status = "on_track";
  }

  // Aggregate by subcategory
  const subcategorySpend = new Map<string, { name: string; spend: number }>();
  for (const tx of transactions) {
    const amount = Math.abs(effectiveAmount(tx));
    for (const tc of tx.categories) {
      if (tc.category.parentId === categoryId) {
        const existing = subcategorySpend.get(tc.categoryId) || {
          name: tc.category.name,
          spend: 0,
        };
        subcategorySpend.set(tc.categoryId, {
          ...existing,
          spend: existing.spend + amount,
        });
      }
    }
  }

  const subcategories = Array.from(subcategorySpend.entries())
    .map(([id, data]) => ({ id, name: data.name, spend: data.spend }))
    .sort((a, b) => b.spend - a.spend);

  // Aggregate by merchant
  const merchantSpend = new Map<
    string,
    { spend: number; transactionCount: number }
  >();
  for (const tx of transactions) {
    const amount = Math.abs(effectiveAmount(tx));
    const merchant = tx.normalizedMerchant || tx.merchantName || tx.description;
    if (merchant) {
      const existing = merchantSpend.get(merchant) || {
        spend: 0,
        transactionCount: 0,
      };
      merchantSpend.set(merchant, {
        spend: existing.spend + amount,
        transactionCount: existing.transactionCount + 1,
      });
    }
  }

  const topMerchants = Array.from(merchantSpend.entries())
    .map(([merchantName, data]) => ({ merchantName, ...data }))
    .sort((a, b) => b.spend - a.spend);

  // Get largest transactions. Note: orderBy on the SQL query uses bank `amount`,
  // so a heavy override on a small bank-amount tx may not surface in the top 5
  // until it's re-sorted by the user.
  const largestTransactions = transactions.slice(0, 5).map((tx) => ({
    transactionId: tx.id,
    transactionDate: tx.transactionDate.toISOString().split("T")[0],
    merchantName: tx.normalizedMerchant || tx.merchantName,
    description: tx.description,
    amount: Math.abs(effectiveAmount(tx)),
  }));

  // Build summary
  const dominantSubcategory =
    subcategories.length > 0 && subcategories[0].spend > actualSpend * 0.4
      ? subcategories[0].name
      : null;
  const dominantMerchant =
    topMerchants.length > 0 && topMerchants[0].spend > actualSpend * 0.3
      ? topMerchants[0].merchantName
      : null;

  return {
    month,
    category: {
      id: categoryId,
      name: category.name,
      status,
      actualSpend,
      monthlyBudget,
      expectedByNow,
      paceDelta,
      overBudgetAmount,
    },
    subcategories,
    topMerchants,
    largestTransactions,
    summary: {
      dominantSubcategory,
      dominantMerchant,
    },
  };
}

export async function getMonthlyBudgetPace(month: string): Promise<MonthlyBudgetPace | null> {
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: {
      fixedCommitments: true,
      plannedSpends: true,
      categoryPlans: {
        include: { category: true },
      },
      events: true,
    },
  });

  if (!budgetMonth) return null;

  // Cycle-scoped pace. Transaction range and pace context both come from the
  // BudgetMonth's stored cycle bounds.
  const cycle = getPayCycleFromBudgetMonth(
    {
      month: budgetMonth.month,
      cycleStartDate: new Date(budgetMonth.cycleStartDate),
      cycleEndDate: new Date(budgetMonth.cycleEndDate),
    },
    new Date(),
  );
  const paceContext = getCyclePaceContext(cycle);

  const ancestryMap = await buildCategoryAncestryMap();
  const roleMap = await getCategoryBudgetRoleMap(month, ancestryMap);

  // Two views of the same cycle:
  //   - outflows: every non-ignored outflow, including uncategorised and
  //     ambiguously-categorised ones. Drives the headline totals + forecast
  //     so the "spent" numbers tally with the user's bank statement.
  //   - resolvedTransactions: only those that resolve to a single safe
  //     category. Used for per-category pace attribution where a bucket is
  //     mandatory.
  const txFilters = {
    startDate: cycle.startInclusive,
    endDate: new Date(cycle.endExclusive.getTime() - 1),
    includeIgnored: false,
  };
  const [outflows, resolvedTransactions] = await Promise.all([
    getReportableOutflows(txFilters, ancestryMap),
    getCategoryResolvedOutflows(txFilters, ancestryMap),
  ]);

  // Calculate overall flexible budget
  const expectedIncome = toNumber(budgetMonth.expectedIncome);
  let savingsTarget: number;
  if (budgetMonth.savingsTargetType === "percent") {
    savingsTarget = expectedIncome * (toNumber(budgetMonth.savingsTargetValue) / 100);
  } else {
    savingsTarget = toNumber(budgetMonth.savingsTargetValue);
  }
  const fixedCommitments = budgetMonth.fixedCommitments.reduce(
    (sum, c) => sum + toNumber(c.amount),
    0
  );
  const plannedOneOffs = budgetMonth.plannedSpends.reduce(
    (sum, s) => sum + toNumber(s.amount),
    0
  );
  // Flexible-funded events are carved out of flexibleBudget at planning time —
  // mirrors getBudgetOverview so pace/overview/analysis agree on the same number.
  const flexibleEventReserves = budgetMonth.events
    .filter((e) => e.fundingSource === "flexible")
    .reduce((sum, e) => sum + toNumber(e.cap), 0);
  const flexibleBudget =
    expectedIncome - savingsTarget - fixedCommitments - plannedOneOffs - flexibleEventReserves;

  // Overall fixed/flexible split runs against ALL outflows. A tx counts as
  // fixed if any of its direct categories is fixed — matches the original
  // pace behaviour and means uncategorised txs are treated as flexible.
  let actualFlexibleSpendToDate = 0;
  let actualFixedSpendToDate = 0;
  for (const tx of outflows) {
    const isFixed = tx.categoryIds.some((id) => roleMap.get(id) === "fixed");
    if (isFixed) {
      actualFixedSpendToDate += tx.amount;
    } else {
      actualFlexibleSpendToDate += tx.amount;
    }
  }

  // Overall pace calculations
  const expectedFlexibleSpendByNow = flexibleBudget * paceContext.elapsedRatio;
  const overallPaceDelta = actualFlexibleSpendToDate - expectedFlexibleSpendByNow;
  const remainingFlexibleBudget = flexibleBudget - actualFlexibleSpendToDate;
  const safeDailySpend = paceContext.remainingDays > 0
    ? Math.max(remainingFlexibleBudget / paceContext.remainingDays, 0)
    : Math.max(remainingFlexibleBudget, 0);
  const weeklyAllowance = safeDailySpend * 7;

  // Determine overall status
  let overallStatus: OverallPaceStatus;
  if (remainingFlexibleBudget < -50) {
    overallStatus = "overspent";
  } else if (remainingFlexibleBudget <= 0) {
    overallStatus = "over_budget";
  } else if (overallPaceDelta > 0) {
    overallStatus = "over_pace";
  } else {
    overallStatus = "on_track";
  }

  // Build category budgets map from plans. Skip any plan whose category is a
  // fixed-commitment category: pace tracking is a "controllable spend" view
  // and fixed categories belong to the fixed-commitment ledger, not pacing.
  const categoryBudgets = new Map<string, { budget: number; categoryName: string }>();
  for (const plan of budgetMonth.categoryPlans) {
    if (plan.categoryId && plan.category && roleMap.get(plan.categoryId) !== "fixed") {
      categoryBudgets.set(plan.categoryId, {
        budget: toNumber(plan.targetValue),
        categoryName: plan.category.name,
      });
    }
  }

  // Attribute each flexible tx to the closest budgeted ancestor (including
  // self). Walking the full chain catches deeper hierarchies — old code only
  // checked self and immediate parent and silently dropped deeper assignments.
  // Uses the resolved-category view: ambiguous multi-category txs are skipped
  // here (they still count toward the overall flexible total above).
  const categorySpendMap = new Map<string, number>();
  for (const tx of resolvedTransactions) {
    if (roleMap.get(tx.categoryId) === "fixed") continue;

    let cursor: string | null = tx.categoryId;
    while (cursor) {
      if (categoryBudgets.has(cursor)) {
        categorySpendMap.set(cursor, (categorySpendMap.get(cursor) || 0) + tx.amount);
        break;
      }
      cursor = ancestryMap.get(cursor)?.parentId ?? null;
    }
  }

  // Build category pace array
  const categories: CategoryPace[] = [];
  
  for (const [categoryId, budgetInfo] of categoryBudgets) {
    const actualSpendToDate = categorySpendMap.get(categoryId) || 0;
    const monthlyBudget = budgetInfo.budget;
    const expectedSpendByNow = monthlyBudget * paceContext.elapsedRatio;
    const paceDelta = actualSpendToDate - expectedSpendByNow;
    const remainingBudget = monthlyBudget - actualSpendToDate;
    
    let status: CategoryPaceStatus;
    if (remainingBudget < 0) {
      status = "over_budget";
    } else if (paceDelta > 0) {
      status = "over_pace";
    } else {
      status = "on_track";
    }
    
    categories.push({
      categoryId,
      categoryName: budgetInfo.categoryName,
      monthlyBudget,
      actualSpendToDate,
      expectedSpendByNow,
      paceDelta,
      remainingBudget,
      status,
    });
  }

  // Sort categories by pace delta descending (worst first)
  categories.sort((a, b) => (b.paceDelta || 0) - (a.paceDelta || 0));

  // Build highlights
  const topOverPaceCategories = categories
    .filter(c => c.status === "over_pace" && c.paceDelta !== null && c.paceDelta > 0)
    .slice(0, 3)
    .map(c => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      actualSpendToDate: c.actualSpendToDate,
      monthlyBudget: c.monthlyBudget!,
      expectedSpendByNow: c.expectedSpendByNow!,
      paceDelta: c.paceDelta!,
    }));

  const topOverBudgetCategories = categories
    .filter(c => c.status === "over_budget" && c.remainingBudget !== null)
    .sort((a, b) => (a.remainingBudget || 0) - (b.remainingBudget || 0)) // Most over first
    .slice(0, 3)
    .map(c => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      actualSpendToDate: c.actualSpendToDate,
      monthlyBudget: c.monthlyBudget!,
      overAmount: Math.abs(c.remainingBudget!),
    }));

  // Linear month-end projection from the current burn rate. Mirrors the
  // formula previously computed client-side in overview-page.tsx.
  const forecast = (() => {
    if (paceContext.elapsedDays === 0) {
      return { projectedFlexibleSpend: 0, projectedOverUnder: 0, isProjectedOver: false };
    }
    const dailyRate = actualFlexibleSpendToDate / paceContext.elapsedDays;
    const projectedFlexibleSpend = dailyRate * paceContext.totalDaysInMonth;
    const projectedOverUnder = projectedFlexibleSpend - flexibleBudget;
    return {
      projectedFlexibleSpend,
      projectedOverUnder,
      isProjectedOver: projectedOverUnder > 0,
    };
  })();

  return {
    month,
    ...paceContext,
    overall: {
      flexibleBudget,
      actualFlexibleSpendToDate,
      expectedFlexibleSpendByNow,
      paceDelta: overallPaceDelta,
      remainingFlexibleBudget,
      safeDailySpend,
      weeklyAllowance,
      status: overallStatus,
      fixedPlanned: fixedCommitments,
      actualFixedSpendToDate,
    },
    forecast,
    categories,
    highlights: {
      topOverPaceCategories,
      topOverBudgetCategories,
    },
  };
}
