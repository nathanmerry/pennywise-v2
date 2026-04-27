import { prisma } from "../lib/prisma.js";
import { effectiveAmount } from "../lib/effective-amount.js";
import crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type VariabilityClass = 
  | "stable" 
  | "regular_lifestyle" 
  | "variable" 
  | "spiky" 
  | "low_signal";

export interface CategoryHistoryMetrics {
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  monthsObserved: number;
  monthlyTotals: { month: string; total: number }[];
  averageMonthlySpend: number;
  medianMonthlySpend: number;
  minMonthlySpend: number;
  maxMonthlySpend: number;
  latestMonthSpend: number;
  coefficientOfVariation: number;
  totalSpendAcrossWindow: number;
  shareOfFlexibleSpend: number;
  currentBudget: number | null;
  hasBudget: boolean;
  variabilityClass: VariabilityClass;
}

export interface SpendingHistoryAnalysis {
  targetMonth: string;
  windowMonths: string[];
  monthsAvailable: number;
  totalFlexibleSpendHistory: number;
  averageMonthlyFlexibleSpend: number;
  categories: CategoryHistoryMetrics[];
  multiCategorySpend: number;
  multiCategoryTransactionCount: number;
  budgetCoverage: {
    historicalSpendWithBudgets: number;
    historicalSpendWithoutBudgets: number;
    coveragePercent: number;
  };
  inputHash: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

function getWindowMonths(targetMonth: string): string[] {
  const [year, month] = targetMonth.split("-").map(Number);
  const months: string[] = [];
  
  for (let i = 1; i <= 4; i++) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.unshift(`${y}-${String(m).padStart(2, "0")}`);
  }
  
  return months;
}

function getMonthDateRange(month: string): { start: Date; end: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
  return { start, end };
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

function classifyVariability(
  cv: number,
  monthsObserved: number,
  averageMonthlySpend: number
): VariabilityClass {
  // low_signal: sparse AND low-information
  if (monthsObserved < 2 && averageMonthlySpend < 50) {
    return "low_signal";
  }
  
  // spiky: single month with meaningful spend OR very high variance
  if (monthsObserved === 1 && averageMonthlySpend >= 50) {
    return "spiky";
  }
  if (cv > 0.8) {
    return "spiky";
  }
  
  // stable: low variance, consistent presence
  if (cv < 0.2 && monthsObserved >= 3) {
    return "stable";
  }
  
  // regular_lifestyle: moderate variance, present most months
  if (cv >= 0.2 && cv <= 0.5 && monthsObserved >= 2) {
    return "regular_lifestyle";
  }
  
  // variable: higher variance but still meaningful
  if (cv > 0.5 && cv <= 0.8 && monthsObserved >= 2) {
    return "variable";
  }
  
  // Default to low_signal for edge cases
  if (monthsObserved < 2) {
    return "low_signal";
  }
  
  return "variable";
}

// ============================================================================
// MULTI-CATEGORY RESOLUTION
// ============================================================================

interface CategoryWithAncestry {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  depth: number;
}

async function buildCategoryAncestryMap(): Promise<Map<string, CategoryWithAncestry>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const result = new Map<string, CategoryWithAncestry>();
  
  function getDepth(id: string): number {
    let depth = 0;
    let current = catMap.get(id);
    while (current?.parentId) {
      depth++;
      current = catMap.get(current.parentId);
    }
    return depth;
  }
  
  for (const cat of categories) {
    result.set(cat.id, {
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId,
      depth: getDepth(cat.id),
    });
  }
  
  return result;
}

function isDescendantOf(
  categoryId: string,
  potentialAncestorId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): boolean {
  let current = ancestryMap.get(categoryId);
  while (current?.parentId) {
    if (current.parentId === potentialAncestorId) return true;
    current = ancestryMap.get(current.parentId);
  }
  return false;
}

function resolveMultiCategoryTransaction(
  directCategoryIds: string[],
  ancestryMap: Map<string, CategoryWithAncestry>
): { resolvedCategoryId: string | null; isMultiCategory: boolean } {
  if (directCategoryIds.length === 0) {
    return { resolvedCategoryId: null, isMultiCategory: false };
  }
  
  if (directCategoryIds.length === 1) {
    return { resolvedCategoryId: directCategoryIds[0], isMultiCategory: false };
  }
  
  // Check if one is a descendant of another - use deepest
  const withDepth = directCategoryIds.map((id) => ({
    id,
    depth: ancestryMap.get(id)?.depth ?? 0,
  }));
  
  // Sort by depth descending
  withDepth.sort((a, b) => b.depth - a.depth);
  
  // Check if the deepest is a descendant of any other
  const deepest = withDepth[0];
  const others = withDepth.slice(1);
  
  for (const other of others) {
    if (isDescendantOf(deepest.id, other.id, ancestryMap)) {
      // Deepest is a descendant of another direct category - use deepest
      return { resolvedCategoryId: deepest.id, isMultiCategory: false };
    }
  }
  
  // Multiple unrelated direct categories - exclude from totals
  return { resolvedCategoryId: null, isMultiCategory: true };
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

export async function getSpendingHistoryAnalysis(
  targetMonth: string
): Promise<SpendingHistoryAnalysis> {
  const windowMonths = getWindowMonths(targetMonth);
  const ancestryMap = await buildCategoryAncestryMap();
  
  // Get all transactions in the window
  const allTransactions: Array<{
    month: string;
    transactionId: string;
    amount: number;
    directCategoryIds: string[];
  }> = [];
  
  for (const month of windowMonths) {
    const { start, end } = getMonthDateRange(month);
    
    const transactions = await prisma.transaction.findMany({
      where: {
        transactionDate: { gte: start, lte: end },
        isIgnored: false,
        amount: { lt: 0 }, // Only outflows
      },
      include: {
        categories: {
          where: {
            source: { not: "inherited" }, // Direct assignments only
          },
          select: { categoryId: true },
        },
      },
    });
    
    for (const tx of transactions) {
      allTransactions.push({
        month,
        transactionId: tx.id,
        amount: Math.abs(effectiveAmount(tx)),
        directCategoryIds: tx.categories.map((c) => c.categoryId),
      });
    }
  }
  
  // Resolve multi-category conflicts and aggregate
  const categoryMonthlyTotals = new Map<string, Map<string, number>>();
  let multiCategorySpend = 0;
  let multiCategoryTransactionCount = 0;
  let totalFlexibleSpendHistory = 0;
  
  for (const tx of allTransactions) {
    const { resolvedCategoryId, isMultiCategory } = resolveMultiCategoryTransaction(
      tx.directCategoryIds,
      ancestryMap
    );
    
    if (isMultiCategory) {
      multiCategorySpend += tx.amount;
      multiCategoryTransactionCount++;
      continue;
    }
    
    if (resolvedCategoryId) {
      totalFlexibleSpendHistory += tx.amount;
      
      if (!categoryMonthlyTotals.has(resolvedCategoryId)) {
        categoryMonthlyTotals.set(resolvedCategoryId, new Map());
      }
      const monthMap = categoryMonthlyTotals.get(resolvedCategoryId)!;
      monthMap.set(tx.month, (monthMap.get(tx.month) || 0) + tx.amount);
    }
  }
  
  // Get existing budgets for target month
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: targetMonth },
    include: {
      categoryPlans: {
        where: { categoryId: { not: null } },
        select: { categoryId: true, targetValue: true },
      },
    },
  });
  
  const categoryBudgets = new Map<string, number>();
  if (budgetMonth) {
    for (const plan of budgetMonth.categoryPlans) {
      if (plan.categoryId) {
        categoryBudgets.set(plan.categoryId, toNumber(plan.targetValue));
      }
    }
  }
  
  // Build category metrics
  const categories: CategoryHistoryMetrics[] = [];
  const monthsAvailable = windowMonths.length;
  
  for (const [categoryId, monthMap] of categoryMonthlyTotals) {
    const catInfo = ancestryMap.get(categoryId);
    if (!catInfo) continue;
    
    const monthlyTotals: { month: string; total: number }[] = [];
    const values: number[] = [];
    
    for (const month of windowMonths) {
      const total = monthMap.get(month) || 0;
      monthlyTotals.push({ month, total });
      if (total > 0) {
        values.push(total);
      }
    }
    
    const monthsObserved = values.length;
    if (monthsObserved === 0) continue;
    
    const totalSpendAcrossWindow = values.reduce((a, b) => a + b, 0);
    const averageMonthlySpend = totalSpendAcrossWindow / monthsObserved;
    const medianMonthlySpend = calculateMedian(values);
    const minMonthlySpend = Math.min(...values);
    const maxMonthlySpend = Math.max(...values);
    const latestMonthSpend = monthMap.get(windowMonths[windowMonths.length - 1]) || 0;
    
    const stdDev = calculateStdDev(values, averageMonthlySpend);
    const coefficientOfVariation = averageMonthlySpend > 0 
      ? stdDev / averageMonthlySpend 
      : 0;
    
    const variabilityClass = classifyVariability(
      coefficientOfVariation,
      monthsObserved,
      averageMonthlySpend
    );
    
    const currentBudget = categoryBudgets.get(categoryId) ?? null;
    const shareOfFlexibleSpend = totalFlexibleSpendHistory > 0
      ? (totalSpendAcrossWindow / totalFlexibleSpendHistory) * 100
      : 0;
    
    categories.push({
      categoryId,
      categoryName: catInfo.categoryName,
      parentCategoryId: catInfo.parentId,
      monthsObserved,
      monthlyTotals,
      averageMonthlySpend: Math.round(averageMonthlySpend * 100) / 100,
      medianMonthlySpend: Math.round(medianMonthlySpend * 100) / 100,
      minMonthlySpend: Math.round(minMonthlySpend * 100) / 100,
      maxMonthlySpend: Math.round(maxMonthlySpend * 100) / 100,
      latestMonthSpend: Math.round(latestMonthSpend * 100) / 100,
      coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
      totalSpendAcrossWindow: Math.round(totalSpendAcrossWindow * 100) / 100,
      shareOfFlexibleSpend: Math.round(shareOfFlexibleSpend * 100) / 100,
      currentBudget,
      hasBudget: currentBudget !== null,
      variabilityClass,
    });
  }
  
  // Sort by total spend descending
  categories.sort((a, b) => b.totalSpendAcrossWindow - a.totalSpendAcrossWindow);
  
  // Calculate budget coverage
  let historicalSpendWithBudgets = 0;
  let historicalSpendWithoutBudgets = 0;
  
  for (const cat of categories) {
    if (cat.hasBudget) {
      historicalSpendWithBudgets += cat.totalSpendAcrossWindow;
    } else {
      historicalSpendWithoutBudgets += cat.totalSpendAcrossWindow;
    }
  }
  
  const coveragePercent = totalFlexibleSpendHistory > 0
    ? (historicalSpendWithBudgets / totalFlexibleSpendHistory) * 100
    : 0;
  
  // Calculate input hash for staleness detection
  const inputHash = computeInputHash({
    windowMonths,
    categories: categories.map((c) => ({
      id: c.categoryId,
      totals: c.monthlyTotals,
    })),
    multiCategorySpend,
    categoryBudgets: Array.from(categoryBudgets.entries()),
  });
  
  return {
    targetMonth,
    windowMonths,
    monthsAvailable,
    totalFlexibleSpendHistory: Math.round(totalFlexibleSpendHistory * 100) / 100,
    averageMonthlyFlexibleSpend: Math.round((totalFlexibleSpendHistory / monthsAvailable) * 100) / 100,
    categories,
    multiCategorySpend: Math.round(multiCategorySpend * 100) / 100,
    multiCategoryTransactionCount,
    budgetCoverage: {
      historicalSpendWithBudgets: Math.round(historicalSpendWithBudgets * 100) / 100,
      historicalSpendWithoutBudgets: Math.round(historicalSpendWithoutBudgets * 100) / 100,
      coveragePercent: Math.round(coveragePercent * 100) / 100,
    },
    inputHash,
  };
}

// ============================================================================
// CATEGORY EVIDENCE (for trust-building "Why?" UI)
// ============================================================================

export interface CategoryEvidence {
  categoryId: string;
  categoryName: string;
  monthlyTotals: { month: string; total: number }[];
  topMerchants: { merchantName: string; totalSpend: number; transactionCount: number }[];
  biggestTransactions: {
    date: string;
    merchantName: string | null;
    description: string;
    amount: number;
  }[];
  spikeMonth: string | null;
  spikeAmount: number | null;
}

export async function getCategoryEvidenceBatch(
  targetMonth: string
): Promise<Map<string, CategoryEvidence>> {
  const windowMonths = getWindowMonths(targetMonth);
  const ancestryMap = await buildCategoryAncestryMap();
  const result = new Map<string, CategoryEvidence>();

  // Build date range for full window
  const { start: windowStart } = getMonthDateRange(windowMonths[0]);
  const { end: windowEnd } = getMonthDateRange(windowMonths[windowMonths.length - 1]);

  // Fetch all transactions with merchant and description info
  const transactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: windowStart, lte: windowEnd },
      isIgnored: false,
      amount: { lt: 0 },
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      updatedTransactionAmount: true,
      merchantName: true,
      description: true,
      categories: {
        where: { source: { not: "inherited" } },
        select: { categoryId: true },
      },
    },
    orderBy: { transactionDate: "desc" },
  });

  // Group transactions by resolved category
  const categoryTransactions = new Map<string, typeof transactions>();

  for (const tx of transactions) {
    const directCategoryIds = tx.categories.map((c) => c.categoryId);
    const { resolvedCategoryId, isMultiCategory } = resolveMultiCategoryTransaction(
      directCategoryIds,
      ancestryMap
    );

    if (isMultiCategory || !resolvedCategoryId) continue;

    if (!categoryTransactions.has(resolvedCategoryId)) {
      categoryTransactions.set(resolvedCategoryId, []);
    }
    categoryTransactions.get(resolvedCategoryId)!.push(tx);
  }

  // Build evidence for each category
  for (const [categoryId, txs] of categoryTransactions) {
    const catInfo = ancestryMap.get(categoryId);
    if (!catInfo) continue;

    // Monthly totals
    const monthTotals = new Map<string, number>();
    for (const month of windowMonths) {
      monthTotals.set(month, 0);
    }
    for (const tx of txs) {
      const txDate = new Date(tx.transactionDate);
      const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}`;
      if (monthTotals.has(txMonth)) {
        monthTotals.set(txMonth, (monthTotals.get(txMonth) || 0) + Math.abs(effectiveAmount(tx)));
      }
    }

    const monthlyTotals = windowMonths.map((m) => ({
      month: m,
      total: Math.round((monthTotals.get(m) || 0) * 100) / 100,
    }));

    // Top merchants (by total spend)
    const merchantTotals = new Map<string, { totalSpend: number; count: number }>();
    for (const tx of txs) {
      const name = tx.merchantName || tx.description.slice(0, 40);
      const existing = merchantTotals.get(name) || { totalSpend: 0, count: 0 };
      existing.totalSpend += Math.abs(effectiveAmount(tx));
      existing.count++;
      merchantTotals.set(name, existing);
    }

    const topMerchants = [...merchantTotals.entries()]
      .map(([merchantName, data]) => ({
        merchantName,
        totalSpend: Math.round(data.totalSpend * 100) / 100,
        transactionCount: data.count,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    // Biggest transactions (top 5 by amount)
    const biggestTransactions = txs
      .map((tx) => ({
        date: new Date(tx.transactionDate).toISOString().slice(0, 10),
        merchantName: tx.merchantName,
        description: tx.description,
        amount: Math.round(Math.abs(effectiveAmount(tx)) * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Detect spike month (month with > 2x median spend)
    const nonZeroTotals = monthlyTotals.filter((m) => m.total > 0).map((m) => m.total);
    const median = calculateMedian(nonZeroTotals);
    let spikeMonth: string | null = null;
    let spikeAmount: number | null = null;

    if (median > 0) {
      for (const mt of monthlyTotals) {
        if (mt.total > median * 2 && mt.total > 30) {
          if (!spikeAmount || mt.total > spikeAmount) {
            spikeMonth = mt.month;
            spikeAmount = mt.total;
          }
        }
      }
    }

    result.set(categoryId, {
      categoryId,
      categoryName: catInfo.categoryName,
      monthlyTotals,
      topMerchants,
      biggestTransactions,
      spikeMonth,
      spikeAmount: spikeAmount ? Math.round(spikeAmount * 100) / 100 : null,
    });
  }

  return result;
}

// ============================================================================
// INPUT HASH FOR STALENESS DETECTION
// ============================================================================

function computeInputHash(data: {
  windowMonths: string[];
  categories: Array<{ id: string; totals: { month: string; total: number }[] }>;
  multiCategorySpend: number;
  categoryBudgets: [string, number][];
}): string {
  const serialized = JSON.stringify(data);
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

export function computeFullInputHash(
  historyAnalysis: SpendingHistoryAnalysis,
  budgetContext: {
    expectedIncome: number;
    savingsTarget: number;
    fixedCommitments: number;
    plannedOneOffs: number;
  }
): string {
  const data = {
    historyHash: historyAnalysis.inputHash,
    ...budgetContext,
  };
  const serialized = JSON.stringify(data);
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}
