import { prisma } from "../lib/prisma.js";
import { getCyclePaceContext, getPayCycleFromBudgetMonth } from "./cycle.js";

export interface BudgetOverview {
  month: string;
  expectedIncome: number;
  paydayDate: Date;
  /** Start of the pay cycle (previous payday) — shown in UI. */
  cycleStart: Date;
  /** End of the pay cycle (this payday) — shown in UI. */
  cycleEnd: Date;
  daysInCycle: number;
  daysElapsed: number;
  daysRemaining: number;
  savingsTarget: number;
  fixedCommitments: number;
  plannedOneOffs: number;
  flexibleBudget: number;
  actualSpend: number;
  remainingFlexible: number;
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
    },
  });

  if (!budgetMonth) return null;

  // Phase 1: Overview operates on the pay cycle ending on this budgetMonth's payday,
  // NOT the calendar month. Transaction queries use (prevPayday, thisPayday] to avoid
  // overlapping adjacent cycles.
  const now = new Date();
  const cycle = getPayCycleFromBudgetMonth(
    { month: budgetMonth.month, paydayDate: new Date(budgetMonth.paydayDate) },
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

  // Flexible budget = income - savings - fixed - planned
  const flexibleBudget = expectedIncome - savingsTarget - fixedCommitments - plannedOneOffs;

  // Build fixed-category set from linked BudgetFixedCommitments. Spend on these
  // categories is counted toward fixed spend and excluded from flexible tally
  // so remainingFlexible / daily+weekly allowances reflect controllable spend.
  const fixedCategoryIds = new Set<string>();
  const hasLinkedCommitment = budgetMonth.fixedCommitments.some((c) => c.categoryId);
  if (hasLinkedCommitment) {
    const allCategories = await prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<string, string[]>();
    for (const cat of allCategories) {
      if (cat.parentId) {
        const kids = childrenMap.get(cat.parentId) ?? [];
        kids.push(cat.id);
        childrenMap.set(cat.parentId, kids);
      }
    }
    const addWithDescendants = (id: string) => {
      if (fixedCategoryIds.has(id)) return;
      fixedCategoryIds.add(id);
      for (const kid of childrenMap.get(id) ?? []) addWithDescendants(kid);
    };
    for (const commitment of budgetMonth.fixedCommitments) {
      if (commitment.categoryId) addWithDescendants(commitment.categoryId);
    }
  }

  // Split spend into flexible vs fixed using the source-of-truth commitment links.
  let actualSpend = 0;
  let actualFlexibleSpend = 0;
  for (const tx of transactions) {
    const amount = toNumber(tx.amount);
    if (amount >= 0) continue;
    const abs = Math.abs(amount);
    actualSpend += abs;
    const isFixed =
      fixedCategoryIds.size > 0 &&
      tx.categories.some((c) => fixedCategoryIds.has(c.categoryId));
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
    .filter((t) => toNumber(t.amount) > 0)
    .reduce((sum, t) => sum + toNumber(t.amount), 0);

  const moneyOut = allTransactions
    .filter((t) => toNumber(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(toNumber(t.amount)), 0);

  // Net after ignored = only non-ignored transactions
  const netAfterIgnored = transactions.reduce((sum, t) => sum + toNumber(t.amount), 0);

  return {
    month,
    expectedIncome,
    paydayDate: cycle.paydayDate,
    cycleStart: cycle.previousPaydayDate,
    cycleEnd: cycle.paydayDate,
    daysInCycle: cycle.daysInCycle,
    daysElapsed: cycle.daysElapsed,
    daysRemaining: cycle.daysRemaining,
    savingsTarget,
    fixedCommitments,
    plannedOneOffs,
    flexibleBudget,
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

export async function getSpendingBreakdown(month: string): Promise<SpendingBreakdown> {
  // Phase 1: cycle-scoped breakdown. Falls back to calendar month bounds if the
  // BudgetMonth hasn't been seeded (e.g. caller passed a month key without data).
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: { categoryPlans: true },
  });
  const range = budgetMonth
    ? (() => {
        const cycle = getPayCycleFromBudgetMonth(
          { month: budgetMonth.month, paydayDate: new Date(budgetMonth.paydayDate) },
          new Date(),
        );
        return { start: cycle.startInclusive, end: cycle.endExclusive, isCycle: true };
      })()
    : (() => {
        const { start, end } = getMonthDateRange(month);
        return { start, end, isCycle: false };
      })();

  // Get all non-ignored transactions with categories
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: range.isCycle
        ? { gte: range.start, lt: range.end }
        : { gte: range.start, lte: range.end },
      isIgnored: false,
      amount: { lt: 0 }, // Only outflows
    },
    include: {
      categories: {
        include: {
          category: {
            include: {
              parent: true,
              budgetGroupMappings: { include: { budgetGroup: true } },
            },
          },
        },
      },
    },
  });

  // Get all categories for hierarchy
  const allCategories = await prisma.category.findMany({
    include: { parent: true },
  });

  // Get budget groups
  const budgetGroups = await prisma.budgetGroup.findMany({
    include: { categoryMappings: { include: { category: true } } },
  });

  // Build category -> budget group map
  const categoryToBudgetGroup = new Map<string, { id: string; name: string }>();
  for (const group of budgetGroups) {
    for (const mapping of group.categoryMappings) {
      categoryToBudgetGroup.set(mapping.categoryId, { id: group.id, name: group.name });
    }
  }

  // Aggregate by parent category
  const parentSpend = new Map<string, { name: string; spent: number }>();
  // Aggregate by child category
  const childSpend = new Map<string, { name: string; parentId: string | null; parentName: string | null; spent: number }>();
  // Aggregate by budget group
  const groupSpend = new Map<string, { name: string; spent: number }>();
  // Aggregate by merchant
  const merchantSpend = new Map<string, { spent: number; count: number }>();
  // Daily spend
  const dailySpend = new Map<string, number>();

  for (const tx of transactions) {
    const amount = Math.abs(toNumber(tx.amount));
    const dateKey = tx.transactionDate.toISOString().split("T")[0];

    // Daily spend
    dailySpend.set(dateKey, (dailySpend.get(dateKey) || 0) + amount);

    // Merchant spend
    const merchant = tx.normalizedMerchant || tx.merchantName || tx.description;
    if (merchant) {
      const existing = merchantSpend.get(merchant) || { spent: 0, count: 0 };
      merchantSpend.set(merchant, { spent: existing.spent + amount, count: existing.count + 1 });
    }

    // Category spend - use first category if multiple
    if (tx.categories.length > 0) {
      const cat = tx.categories[0].category;
      const parentCat = cat.parent || cat; // If no parent, treat as parent itself

      // Parent category aggregation
      const parentKey = parentCat.id;
      const existingParent = parentSpend.get(parentKey) || { name: parentCat.name, spent: 0 };
      parentSpend.set(parentKey, { ...existingParent, spent: existingParent.spent + amount });

      // Child category aggregation (only if it has a parent)
      if (cat.parentId) {
        const existingChild = childSpend.get(cat.id) || {
          name: cat.name,
          parentId: cat.parentId,
          parentName: cat.parent?.name || null,
          spent: 0,
        };
        childSpend.set(cat.id, { ...existingChild, spent: existingChild.spent + amount });
      }

      // Budget group aggregation
      const group = categoryToBudgetGroup.get(cat.id) || categoryToBudgetGroup.get(parentCat.id);
      if (group) {
        const existingGroup = groupSpend.get(group.id) || { name: group.name, spent: 0 };
        groupSpend.set(group.id, { ...existingGroup, spent: existingGroup.spent + amount });
      }
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

  // Phase 1: cycle-scoped pressure view.
  const cycle = getPayCycleFromBudgetMonth(
    { month: budgetMonth.month, paydayDate: new Date(budgetMonth.paydayDate) },
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
    (sum, t) => sum + Math.abs(toNumber(t.amount)),
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
    const amount = Math.abs(toNumber(tx.amount));
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
    const amount = Math.abs(toNumber(tx.amount));
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

  // Get largest transactions
  const largestTransactions = transactions.slice(0, 5).map((tx) => ({
    transactionId: tx.id,
    transactionDate: tx.transactionDate.toISOString().split("T")[0],
    merchantName: tx.normalizedMerchant || tx.merchantName,
    description: tx.description,
    amount: Math.abs(toNumber(tx.amount)),
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
    },
  });

  if (!budgetMonth) return null;

  // Phase 1: cycle-scoped pace. Transaction range and pace context both come
  // from the pay cycle ending on this BudgetMonth's paydayDate.
  const cycle = getPayCycleFromBudgetMonth(
    { month: budgetMonth.month, paydayDate: new Date(budgetMonth.paydayDate) },
    new Date(),
  );
  const paceContext = getCyclePaceContext(cycle);

  // Get all non-ignored, non-pending spending transactions for the cycle
  // Only use direct category assignments (source != 'inherited') to avoid double counting
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: cycle.startInclusive, lt: cycle.endExclusive },
      isIgnored: false,
      amount: { lt: 0 }, // Only outflows (spending)
    },
    include: {
      categories: {
        where: {
          source: { not: "inherited" }, // Exclude inherited to avoid double counting
        },
        include: {
          category: {
            include: { parent: true },
          },
        },
      },
    },
  });

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
  const flexibleBudget = expectedIncome - savingsTarget - fixedCommitments - plannedOneOffs;

  // Build the set of categories treated as "fixed": every category linked by a
  // BudgetFixedCommitment, plus all descendants. Spend on these categories is
  // excluded from the flexible tally so pacing reflects controllable spend only.
  const fixedCategoryIds = new Set<string>();
  const hasLinkedCommitment = budgetMonth.fixedCommitments.some((c) => c.categoryId);

  if (hasLinkedCommitment) {
    const allCategories = await prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<string, string[]>();
    for (const cat of allCategories) {
      if (cat.parentId) {
        const kids = childrenMap.get(cat.parentId) ?? [];
        kids.push(cat.id);
        childrenMap.set(cat.parentId, kids);
      }
    }

    const addWithDescendants = (id: string) => {
      if (fixedCategoryIds.has(id)) return;
      fixedCategoryIds.add(id);
      for (const kid of childrenMap.get(id) ?? []) addWithDescendants(kid);
    };

    for (const commitment of budgetMonth.fixedCommitments) {
      if (commitment.categoryId) addWithDescendants(commitment.categoryId);
    }
  }

  const isFixedTransaction = (tx: (typeof transactions)[number]): boolean => {
    if (fixedCategoryIds.size === 0) return false;
    return tx.categories.some((tc) => fixedCategoryIds.has(tc.categoryId));
  };

  let actualFlexibleSpendToDate = 0;
  let actualFixedSpendToDate = 0;
  for (const tx of transactions) {
    const amount = Math.abs(toNumber(tx.amount));
    if (isFixedTransaction(tx)) {
      actualFixedSpendToDate += amount;
    } else {
      actualFlexibleSpendToDate += amount;
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
    if (plan.categoryId && plan.category && !fixedCategoryIds.has(plan.categoryId)) {
      categoryBudgets.set(plan.categoryId, {
        budget: toNumber(plan.targetValue),
        categoryName: plan.category.name,
      });
    }
  }

  // Aggregate spend by category (using parent category for hierarchy)
  // Only count transactions with a single direct budgeted category to avoid ambiguity
  const categorySpendMap = new Map<string, number>();

  for (const tx of transactions) {
    // Skip fixed-commitment transactions: they shouldn't inflate the flexible
    // spend on any budgeted category.
    if (isFixedTransaction(tx)) continue;

    const amount = Math.abs(toNumber(tx.amount));

    // Get direct category assignments
    const directCategories = tx.categories.filter(tc => tc.source !== "inherited");

    if (directCategories.length === 0) continue;
    
    // Find which categories have budgets (check both direct and parent)
    const budgetedCategories: string[] = [];
    for (const tc of directCategories) {
      const cat = tc.category;
      // Check if this category or its parent has a budget
      if (categoryBudgets.has(cat.id)) {
        budgetedCategories.push(cat.id);
      } else if (cat.parentId && categoryBudgets.has(cat.parentId)) {
        budgetedCategories.push(cat.parentId);
      }
    }
    
    // Only count if exactly one budgeted category to avoid double counting
    if (budgetedCategories.length === 1) {
      const catId = budgetedCategories[0];
      categorySpendMap.set(catId, (categorySpendMap.get(catId) || 0) + amount);
    }
    // If multiple budgeted categories, we skip this transaction for category pace
    // This is conservative but avoids fake accuracy
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
    categories,
    highlights: {
      topOverPaceCategories,
      topOverBudgetCategories,
    },
  };
}
