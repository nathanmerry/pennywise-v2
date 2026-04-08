import { prisma } from "../lib/prisma.js";

export interface BudgetOverview {
  month: string;
  expectedIncome: number;
  paydayDate: Date;
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

  const { start, end } = getMonthDateRange(month);

  // Get all non-ignored transactions for the month
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
      isIgnored: false,
    },
    select: { amount: true },
  });

  // Get all transactions including ignored for money in/out totals
  const allTransactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
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

  // Actual spend (negative amounts are outflows in most banking APIs)
  // We sum absolute values of negative transactions
  const actualSpend = transactions
    .filter((t) => toNumber(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(toNumber(t.amount)), 0);

  const remainingFlexible = flexibleBudget - actualSpend;

  // Days/weeks until payday
  const now = new Date();
  const payday = new Date(budgetMonth.paydayDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilPayday = Math.max(0, Math.ceil((payday.getTime() - now.getTime()) / msPerDay));
  const weeksUntilPayday = daysUntilPayday / 7;

  // Weekly/daily allowance based on remaining time
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
    paydayDate: payday,
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
  const { start, end } = getMonthDateRange(month);

  // Get all non-ignored transactions with categories
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
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

  // Get budget plans for the month
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: { categoryPlans: true },
  });

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
