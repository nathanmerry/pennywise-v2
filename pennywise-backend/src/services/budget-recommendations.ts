import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import {
  getSpendingHistoryAnalysis,
  computeFullInputHash,
  type SpendingHistoryAnalysis,
  type CategoryHistoryMetrics,
  type VariabilityClass,
} from "./spending-history.js";

// ============================================================================
// TYPES
// ============================================================================

export type RecommendationStatus =
  | "recommended"
  | "close_to_history"
  | "trimmed_for_savings"
  | "low_confidence"
  | "needs_budget_no_recommendation"
  | "skip";

export type Confidence = "high" | "medium" | "low";
export type SavingsTargetPressure = "low" | "medium" | "high";
export type BudgetLevel = "parent" | "child";

export interface RecommendationDriverCategory {
  categoryId: string;
  categoryName: string;
  historicalAverage: number;
  shareOfBranchSpend: number;
  currentBudget: number | null;
  hasBudget: boolean;
}

export interface RecommendationBranch {
  branchCategoryId: string;
  branchCategoryName: string;
  budgetLevel: BudgetLevel;
  resolutionReason: string;
  historicalAverage: number;
  driverCategories: RecommendationDriverCategory[];
  recommendedCategoryIds: string[];
}

export interface CategoryRecommendation {
  categoryId: string;
  categoryName: string;
  branchCategoryId: string;
  branchCategoryName: string;
  budgetLevel: BudgetLevel;
  variabilityClass: VariabilityClass;
  historicalAverage: number;
  historicalMedian: number;
  latestMonthSpend: number;
  currentBudget: number | null;
  needsBudget: boolean;
  recommendedBudget: number | null;
  confidence: Confidence;
  recommendationStatus: RecommendationStatus;
  adjustmentVsAverage: number | null;
  rationale: string;
}

export interface TrimInfo {
  categoryId: string;
  categoryName: string;
  historicalAverage: number;
  recommendedBudget: number;
  trimAmount: number;
  trimPercent: number;
  rationale: string;
}

export interface UncoveredHighSpend {
  categoryId: string;
  categoryName: string;
  historicalAverage: number;
  shareOfFlexibleSpend: number;
}

export interface BudgetRecommendationResponse {
  runId: string;
  source: "ai" | "fallback";
  stale: boolean;
  summary: {
    windowMonths: string[];
    targetFlexibleBudget: number;
    historicalFlexibleAverage: number;
    totalRecommendedBudget: number;
    savingsTargetPressure: SavingsTargetPressure;
    budgetCoveragePercent: number;
    overallRationale: string;
  };
  branches: RecommendationBranch[];
  categories: CategoryRecommendation[];
  trims: TrimInfo[];
  uncoveredHighSpend: UncoveredHighSpend[];
  diagnostics: {
    multiCategorySpend: number;
    multiCategoryTransactionCount: number;
    categoriesWithInsufficientData: number;
  };
}

interface BudgetContext {
  expectedIncome: number;
  savingsTarget: number;
  fixedCommitments: number;
  plannedOneOffs: number;
  targetFlexibleBudget: number;
}

interface CategoryTreeNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface ResolvedHistoryCategory extends CategoryHistoryMetrics {
  branchCategoryId: string;
  branchCategoryName: string;
  budgetLevel: BudgetLevel;
}

interface ResolvedRecommendationHistory
  extends Omit<SpendingHistoryAnalysis, "categories" | "budgetCoverage"> {
  categories: ResolvedHistoryCategory[];
  branches: RecommendationBranch[];
  budgetCoverage: {
    historicalSpendWithBudgets: number;
    historicalSpendWithoutBudgets: number;
    coveragePercent: number;
  };
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

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
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
  if (monthsObserved < 2 && averageMonthlySpend < 50) {
    return "low_signal";
  }
  if (monthsObserved === 1 && averageMonthlySpend >= 50) {
    return "spiky";
  }
  if (cv > 0.8) {
    return "spiky";
  }
  if (cv < 0.2 && monthsObserved >= 3) {
    return "stable";
  }
  if (cv >= 0.2 && cv <= 0.5 && monthsObserved >= 2) {
    return "regular_lifestyle";
  }
  if (cv > 0.5 && cv <= 0.8 && monthsObserved >= 2) {
    return "variable";
  }
  if (monthsObserved < 2) {
    return "low_signal";
  }
  return "variable";
}

async function buildCategoryTree(): Promise<Map<string, CategoryTreeNode>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });

  return new Map(categories.map((category) => [
    category.id,
    {
      id: category.id,
      name: category.name,
      parentId: category.parentId,
    },
  ]));
}

function getRootCategoryId(
  categoryId: string,
  categoryTree: Map<string, CategoryTreeNode>,
  rootCache: Map<string, string>
): string {
  const cached = rootCache.get(categoryId);
  if (cached) return cached;

  let current = categoryTree.get(categoryId);
  if (!current) {
    rootCache.set(categoryId, categoryId);
    return categoryId;
  }

  while (current.parentId) {
    const parent = categoryTree.get(current.parentId);
    if (!parent) break;
    current = parent;
  }

  rootCache.set(categoryId, current.id);
  return current.id;
}

function isCategoryInSubtree(
  categoryId: string,
  ancestorId: string,
  categoryTree: Map<string, CategoryTreeNode>
): boolean {
  let currentId: string | null = categoryId;

  while (currentId) {
    if (currentId === ancestorId) return true;
    currentId = categoryTree.get(currentId)?.parentId ?? null;
  }

  return false;
}

function aggregateResolvedCategory(params: {
  historyCategories: CategoryHistoryMetrics[];
  windowMonths: string[];
  totalFlexibleSpendHistory: number;
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  currentBudget: number | null;
  branchCategoryId: string;
  branchCategoryName: string;
  budgetLevel: BudgetLevel;
  includeCategory: (category: CategoryHistoryMetrics) => boolean;
}): ResolvedHistoryCategory | null {
  const relevantCategories = params.historyCategories.filter(params.includeCategory);

  if (relevantCategories.length === 0 && params.currentBudget === null) {
    return null;
  }

  const monthlyTotals = params.windowMonths.map((month) => ({
    month,
    total: 0,
  }));

  for (const category of relevantCategories) {
    for (const monthlyTotal of category.monthlyTotals) {
      const monthEntry = monthlyTotals.find((entry) => entry.month === monthlyTotal.month);
      if (monthEntry) {
        monthEntry.total += monthlyTotal.total;
      }
    }
  }

  for (const entry of monthlyTotals) {
    entry.total = roundCurrency(entry.total);
  }

  const values = monthlyTotals
    .map((entry) => entry.total)
    .filter((total) => total > 0);

  const monthsObserved = values.length;
  const totalSpendAcrossWindow = roundCurrency(
    monthlyTotals.reduce((sum, entry) => sum + entry.total, 0)
  );
  const averageMonthlySpend = monthsObserved > 0
    ? roundCurrency(totalSpendAcrossWindow / monthsObserved)
    : 0;
  const medianMonthlySpend = roundCurrency(calculateMedian(values));
  const minMonthlySpend = roundCurrency(values.length > 0 ? Math.min(...values) : 0);
  const maxMonthlySpend = roundCurrency(values.length > 0 ? Math.max(...values) : 0);
  const latestMonthSpend = roundCurrency(monthlyTotals[monthlyTotals.length - 1]?.total ?? 0);
  const stdDev = calculateStdDev(values, averageMonthlySpend);
  const coefficientOfVariation = averageMonthlySpend > 0
    ? roundCurrency((stdDev / averageMonthlySpend) * 1000) / 10
    : 0;
  const variabilityClass = classifyVariability(
    averageMonthlySpend > 0 ? stdDev / averageMonthlySpend : 0,
    monthsObserved,
    averageMonthlySpend
  );
  const shareOfFlexibleSpend = params.totalFlexibleSpendHistory > 0
    ? roundCurrency((totalSpendAcrossWindow / params.totalFlexibleSpendHistory) * 100)
    : 0;

  return {
    categoryId: params.categoryId,
    categoryName: params.categoryName,
    parentCategoryId: params.parentCategoryId,
    monthsObserved,
    monthlyTotals,
    averageMonthlySpend,
    medianMonthlySpend,
    minMonthlySpend,
    maxMonthlySpend,
    latestMonthSpend,
    coefficientOfVariation,
    totalSpendAcrossWindow,
    shareOfFlexibleSpend,
    currentBudget: params.currentBudget,
    hasBudget: params.currentBudget !== null,
    variabilityClass,
    branchCategoryId: params.branchCategoryId,
    branchCategoryName: params.branchCategoryName,
    budgetLevel: params.budgetLevel,
  };
}

async function buildResolvedRecommendationHistory(
  history: SpendingHistoryAnalysis,
  categoryPlans: Array<{
    categoryId: string | null;
    targetValue: unknown;
    category: { id: string; name: string; parentId: string | null } | null;
  }>
): Promise<ResolvedRecommendationHistory> {
  const categoryTree = await buildCategoryTree();
  const rootCache = new Map<string, string>();
  const currentBudgetMap = new Map<string, number>();
  const manualChildBudgetIdsByBranch = new Map<string, Set<string>>();

  for (const plan of categoryPlans) {
    if (!plan.categoryId || !plan.category) continue;

    currentBudgetMap.set(plan.categoryId, toNumber(plan.targetValue));

    if (plan.category.parentId) {
      const branchId = getRootCategoryId(plan.categoryId, categoryTree, rootCache);
      if (!manualChildBudgetIdsByBranch.has(branchId)) {
        manualChildBudgetIdsByBranch.set(branchId, new Set());
      }
      manualChildBudgetIdsByBranch.get(branchId)!.add(plan.categoryId);
    }
  }

  const branchIds = new Set<string>();
  for (const category of history.categories) {
    branchIds.add(getRootCategoryId(category.categoryId, categoryTree, rootCache));
  }
  for (const branchId of manualChildBudgetIdsByBranch.keys()) {
    branchIds.add(branchId);
  }

  const resolvedCategories: ResolvedHistoryCategory[] = [];
  const branches: RecommendationBranch[] = [];

  for (const branchId of branchIds) {
    const branchNode = categoryTree.get(branchId);
    const branchCategoryName = branchNode?.name
      ?? history.categories.find((category) => category.categoryId === branchId)?.categoryName
      ?? "Unknown";

    const branchHistoryCategories = history.categories.filter(
      (category) => getRootCategoryId(category.categoryId, categoryTree, rootCache) === branchId
    );
    const manualChildBudgetIds = Array.from(manualChildBudgetIdsByBranch.get(branchId) ?? []);
    const budgetLevel: BudgetLevel = manualChildBudgetIds.length > 0 ? "child" : "parent";

    const branchAggregate = aggregateResolvedCategory({
      historyCategories: history.categories,
      windowMonths: history.windowMonths,
      totalFlexibleSpendHistory: history.totalFlexibleSpendHistory,
      categoryId: branchId,
      categoryName: branchCategoryName,
      parentCategoryId: null,
      currentBudget: currentBudgetMap.get(branchId) ?? null,
      branchCategoryId: branchId,
      branchCategoryName,
      budgetLevel: "parent",
      includeCategory: (category) =>
        getRootCategoryId(category.categoryId, categoryTree, rootCache) === branchId,
    });

    const branchTotalSpendAcrossWindow = branchAggregate?.totalSpendAcrossWindow ?? 0;
    const driverCategories = branchHistoryCategories
      .filter((category) => category.parentCategoryId === branchId)
      .map((category) => ({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        historicalAverage: category.averageMonthlySpend,
        shareOfBranchSpend: branchTotalSpendAcrossWindow > 0
          ? roundCurrency((category.totalSpendAcrossWindow / branchTotalSpendAcrossWindow) * 100)
          : 0,
        currentBudget: currentBudgetMap.get(category.categoryId) ?? null,
        hasBudget: currentBudgetMap.has(category.categoryId),
      }))
      .sort((a, b) => b.historicalAverage - a.historicalAverage);

    const recommendedCategoryIds: string[] = [];

    if (budgetLevel === "parent") {
      if (branchHistoryCategories.length > 0 && branchAggregate) {
        resolvedCategories.push(branchAggregate);
        recommendedCategoryIds.push(branchAggregate.categoryId);
      }
    } else {
      for (const childCategoryId of manualChildBudgetIds) {
        const childNode = categoryTree.get(childCategoryId);
        if (!childNode) continue;

        const childAggregate = aggregateResolvedCategory({
          historyCategories: history.categories,
          windowMonths: history.windowMonths,
          totalFlexibleSpendHistory: history.totalFlexibleSpendHistory,
          categoryId: childCategoryId,
          categoryName: childNode.name,
          parentCategoryId: childNode.parentId,
          currentBudget: currentBudgetMap.get(childCategoryId) ?? null,
          branchCategoryId: branchId,
          branchCategoryName,
          budgetLevel: "child",
          includeCategory: (category) =>
            isCategoryInSubtree(category.categoryId, childCategoryId, categoryTree),
        });

        if (childAggregate) {
          resolvedCategories.push(childAggregate);
          recommendedCategoryIds.push(childAggregate.categoryId);
        }
      }
    }

    if (recommendedCategoryIds.length > 0) {
      branches.push({
        branchCategoryId: branchId,
        branchCategoryName,
        budgetLevel,
        resolutionReason: budgetLevel === "child"
          ? "Using child budgets because this month already has manual child budgets in this branch."
          : "Using a single parent budget by default for this branch.",
        historicalAverage: branchAggregate?.averageMonthlySpend ?? 0,
        driverCategories,
        recommendedCategoryIds,
      });
    }
  }

  resolvedCategories.sort((a, b) => b.totalSpendAcrossWindow - a.totalSpendAcrossWindow);
  branches.sort((a, b) => b.historicalAverage - a.historicalAverage);

  let historicalSpendWithBudgets = 0;
  let historicalSpendWithoutBudgets = 0;

  for (const category of resolvedCategories) {
    if (category.hasBudget) {
      historicalSpendWithBudgets += category.totalSpendAcrossWindow;
    } else {
      historicalSpendWithoutBudgets += category.totalSpendAcrossWindow;
    }
  }

  const coveragePercent = history.totalFlexibleSpendHistory > 0
    ? roundCurrency((historicalSpendWithBudgets / history.totalFlexibleSpendHistory) * 100)
    : 0;

  return {
    ...history,
    categories: resolvedCategories,
    branches,
    budgetCoverage: {
      historicalSpendWithBudgets: roundCurrency(historicalSpendWithBudgets),
      historicalSpendWithoutBudgets: roundCurrency(historicalSpendWithoutBudgets),
      coveragePercent,
    },
  };
}

// ============================================================================
// DETERMINISTIC FALLBACK LOGIC
// ============================================================================

function calculateFallbackBudget(cat: ResolvedHistoryCategory): number | null {
  if (cat.variabilityClass === "low_signal") {
    return null;
  }

  const { medianMonthlySpend, averageMonthlySpend, latestMonthSpend } = cat;

  switch (cat.variabilityClass) {
    case "stable":
      return medianMonthlySpend;

    case "regular_lifestyle":
      return (medianMonthlySpend + averageMonthlySpend) / 2;

    case "variable":
      return medianMonthlySpend;

    case "spiky":
      if (medianMonthlySpend < 10) {
        const base = Math.min(latestMonthSpend, averageMonthlySpend);
        return Math.max(base, averageMonthlySpend) * 0.8;
      }
      return Math.max(medianMonthlySpend, Math.min(latestMonthSpend, averageMonthlySpend)) * 0.8;

    default:
      return null;
  }
}

function applySavingsAwareTrims(
  recommendations: Map<string, { budget: number; class: VariabilityClass; name: string; avg: number }>,
  gap: number
): TrimInfo[] {
  if (gap <= 0) return [];

  const trims: TrimInfo[] = [];
  let remainingGap = gap;
  const trimOrder: VariabilityClass[] = ["spiky", "variable", "regular_lifestyle"];
  const maxTrimPercent = 0.3;

  for (const varClass of trimOrder) {
    if (remainingGap <= 0) break;

    const eligibleCategories = Array.from(recommendations.entries())
      .filter(([_, recommendation]) => recommendation.class === varClass && recommendation.budget > 0)
      .sort((a, b) => b[1].budget - a[1].budget);

    for (const [categoryId, recommendation] of eligibleCategories) {
      if (remainingGap <= 0) break;

      const maxTrim = recommendation.budget * maxTrimPercent;
      const actualTrim = Math.min(maxTrim, remainingGap);

      if (actualTrim > 0) {
        const newBudget = recommendation.budget - actualTrim;
        recommendations.set(categoryId, { ...recommendation, budget: newBudget });
        remainingGap -= actualTrim;

        trims.push({
          categoryId,
          categoryName: recommendation.name,
          historicalAverage: recommendation.avg,
          recommendedBudget: roundCurrency(newBudget),
          trimAmount: roundCurrency(actualTrim),
          trimPercent: Math.round((actualTrim / recommendation.budget) * 100),
          rationale: "Trimmed to help meet savings target",
        });
      }
    }
  }

  return trims;
}

function generateDeterministicRecommendations(
  history: ResolvedRecommendationHistory,
  context: BudgetContext
): {
  categories: CategoryRecommendation[];
  trims: TrimInfo[];
  totalRecommendedBudget: number;
  savingsTargetPressure: SavingsTargetPressure;
  overallRationale: string;
} {
  const recommendations = new Map<string, { budget: number; class: VariabilityClass; name: string; avg: number }>();
  const categoryResults: CategoryRecommendation[] = [];

  for (const category of history.categories) {
    const fallbackBudget = calculateFallbackBudget(category);

    if (fallbackBudget !== null) {
      recommendations.set(category.categoryId, {
        budget: fallbackBudget,
        class: category.variabilityClass,
        name: category.categoryName,
        avg: category.averageMonthlySpend,
      });
    }
  }

  let totalRecommendedBudget = Array.from(recommendations.values())
    .reduce((sum, recommendation) => sum + recommendation.budget, 0);

  const gap = totalRecommendedBudget - context.targetFlexibleBudget;
  const trims = applySavingsAwareTrims(recommendations, gap);

  totalRecommendedBudget = Array.from(recommendations.values())
    .reduce((sum, recommendation) => sum + recommendation.budget, 0);

  const remainingGap = totalRecommendedBudget - context.targetFlexibleBudget;
  let savingsTargetPressure: SavingsTargetPressure;
  let overallRationale: string;

  if (remainingGap <= 0) {
    savingsTargetPressure = "low";
    overallRationale = "Recommendations fit within your target flexible budget.";
  } else if (remainingGap <= context.targetFlexibleBudget * 0.1) {
    savingsTargetPressure = "medium";
    overallRationale = "Recommendations are slightly above target. Consider trimming discretionary categories.";
  } else {
    savingsTargetPressure = "high";
    overallRationale = "Your savings target may require lower discretionary spending than recent history supports, or a revised target.";
  }

  const trimmedCategoryIds = new Set(trims.map((trim) => trim.categoryId));

  for (const category of history.categories) {
    const recommendation = recommendations.get(category.categoryId);
    const recommendedBudget = recommendation?.budget ?? null;
    const needsBudget = !category.hasBudget && category.shareOfFlexibleSpend >= 5;

    let recommendationStatus: RecommendationStatus;
    let confidence: Confidence;
    let rationale: string;

    if (category.variabilityClass === "low_signal") {
      recommendationStatus = category.hasBudget ? "low_confidence" : "needs_budget_no_recommendation";
      confidence = "low";
      rationale = category.hasBudget
        ? "Limited recent spending history, so this line is shown to preserve your existing budget split."
        : "Insufficient spending history to make a recommendation.";
    } else if (trimmedCategoryIds.has(category.categoryId)) {
      recommendationStatus = "trimmed_for_savings";
      confidence = "medium";
      rationale = `Trimmed from £${Math.round(category.averageMonthlySpend)} average to help meet savings target.`;
    } else if (recommendedBudget !== null) {
      const diff = Math.abs(recommendedBudget - category.averageMonthlySpend);
      const percentDiff = category.averageMonthlySpend > 0 ? diff / category.averageMonthlySpend : 0;

      if (percentDiff < 0.1) {
        recommendationStatus = "close_to_history";
        confidence = category.monthsObserved >= 3 ? "high" : "medium";
        rationale = `Based on consistent spending pattern over ${category.monthsObserved} months.`;
      } else {
        recommendationStatus = "recommended";
        confidence = category.monthsObserved >= 3 ? "high" : "medium";
        rationale = `Based on ${category.variabilityClass.replace("_", " ")} spending pattern.`;
      }
    } else {
      recommendationStatus = category.hasBudget ? "low_confidence" : "skip";
      confidence = "low";
      rationale = category.hasBudget
        ? "Keeping this line visible because you already budget it separately, but there is not enough recent history for a confident recommendation."
        : "No recommendation available.";
    }

    const adjustmentVsAverage = recommendedBudget !== null
      ? roundCurrency(recommendedBudget - category.averageMonthlySpend)
      : null;

    categoryResults.push({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      branchCategoryId: category.branchCategoryId,
      branchCategoryName: category.branchCategoryName,
      budgetLevel: category.budgetLevel,
      variabilityClass: category.variabilityClass,
      historicalAverage: category.averageMonthlySpend,
      historicalMedian: category.medianMonthlySpend,
      latestMonthSpend: category.latestMonthSpend,
      currentBudget: category.currentBudget,
      needsBudget,
      recommendedBudget: recommendedBudget !== null ? roundCurrency(recommendedBudget) : null,
      confidence,
      recommendationStatus,
      adjustmentVsAverage,
      rationale,
    });
  }

  return {
    categories: categoryResults,
    trims,
    totalRecommendedBudget: roundCurrency(totalRecommendedBudget),
    savingsTargetPressure,
    overallRationale,
  };
}

// ============================================================================
// POST-AI VALIDATION & NORMALIZATION
// ============================================================================

interface AiCategoryRecommendation {
  categoryId: string;
  recommendedBudget: number;
  confidence: Confidence;
  rationale: string;
}

interface AiResponse {
  categories: AiCategoryRecommendation[];
  overallRationale: string;
}

function normalizeAndValidateRecommendations(
  aiResponse: AiResponse,
  history: ResolvedRecommendationHistory,
  context: BudgetContext
): { valid: boolean; normalized: AiResponse | null; fallbackReason?: string } {
  const categoryMap = new Map(history.categories.map((category) => [category.categoryId, category]));
  const normalizedCategories: AiCategoryRecommendation[] = [];

  for (const recommendation of aiResponse.categories) {
    const historyCategory = categoryMap.get(recommendation.categoryId);

    if (!historyCategory) {
      logger.warn({ categoryId: recommendation.categoryId }, "AI recommended unknown category ID");
      continue;
    }

    let budget = recommendation.recommendedBudget;

    if (budget < 0) {
      budget = 0;
    }

    const maxAllowed = Math.min(
      historyCategory.maxMonthlySpend * 1.2,
      Math.max(historyCategory.averageMonthlySpend * 2, historyCategory.medianMonthlySpend * 2)
    );

    if (budget > maxAllowed && maxAllowed > 0) {
      logger.warn(
        { categoryId: recommendation.categoryId, recommended: budget, maxAllowed },
        "AI recommendation clamped as outlier"
      );
      budget = maxAllowed;
    }

    normalizedCategories.push({
      ...recommendation,
      recommendedBudget: roundCurrency(budget),
      rationale: recommendation.rationale || "Based on historical spending",
    });
  }

  const totalRecommended = normalizedCategories.reduce((sum, recommendation) => sum + recommendation.recommendedBudget, 0);

  if (totalRecommended > context.targetFlexibleBudget * 1.5) {
    logger.warn(
      { totalRecommended, targetFlexibleBudget: context.targetFlexibleBudget },
      "AI total recommendations exceed sanity threshold, falling back to deterministic"
    );
    return { valid: false, normalized: null, fallbackReason: "Total recommendations exceeded sanity threshold" };
  }

  return {
    valid: true,
    normalized: {
      categories: normalizedCategories,
      overallRationale: aiResponse.overallRationale || "Based on your recent spending patterns",
    },
  };
}

// ============================================================================
// OPENAI INTEGRATION
// ============================================================================

function buildAiPrompt(
  history: ResolvedRecommendationHistory,
  context: BudgetContext
): { system: string; user: string } {
  const categoryList = history.categories
    .filter((category) => category.variabilityClass !== "low_signal")
    .map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      branchCategoryName: category.branchCategoryName,
      budgetLevel: category.budgetLevel,
      variabilityClass: category.variabilityClass,
      averageMonthlySpend: category.averageMonthlySpend,
      medianMonthlySpend: category.medianMonthlySpend,
      latestMonthSpend: category.latestMonthSpend,
      monthsObserved: category.monthsObserved,
      currentBudget: category.currentBudget,
      hasBudget: category.hasBudget,
    }));

  const system = `You are a budget planning assistant. Your job is to recommend realistic monthly category budgets based on the user's actual spending history.

## Rules

1. Stay anchored to the provided metrics. Do not invent data or make assumptions beyond what is provided.
2. The categories provided are already resolved to the correct budgeting level for this run. Do not split them further or merge them together.
3. Keep budgets realistic. Do not set fantasy budgets that the user will immediately fail.
4. Preserve lifestyle priorities. Categories like eating out, entertainment, and hobbies represent real choices.
5. Trim where there is room. Variable and spiky categories can be trimmed more aggressively than stable essentials.
6. Do not give generic finance advice. No 50/30/20 rules. No moralizing.
7. Use hedged language. Say "suggested", "based on recent history", or "typical" rather than "optimal".

## Output Format

Return JSON with this exact structure:
{
  "categories": [
    {
      "categoryId": "cat_123",
      "recommendedBudget": 250,
      "confidence": "high",
      "rationale": "Consistent spending around £240-260/month"
    }
  ],
  "overallRationale": "Summary of the recommendation approach"
}

Confidence levels:
- "high": 3+ months of consistent data
- "medium": 2+ months or moderate variance
- "low": sparse data or high uncertainty`;

  const user = `Generate budget recommendations for the following spending history.

## Budget Context
- Expected Income: £${context.expectedIncome}
- Savings Target: £${context.savingsTarget}
- Fixed Commitments: £${context.fixedCommitments}
- Planned One-offs: £${context.plannedOneOffs}
- Target Flexible Budget: £${context.targetFlexibleBudget}

## Historical Flexible Spend
- Average Monthly: £${history.averageMonthlyFlexibleSpend}
- Window: ${history.windowMonths.join(", ")}

## Categories
${JSON.stringify(categoryList, null, 2)}

Generate realistic budget recommendations that:
1. Stay close to historical averages for stable and lifestyle categories
2. Trim discretionary categories if needed to approach the target flexible budget
3. Explain the reasoning for each recommendation`;

  return { system, user };
}

async function callOpenAi(
  systemPrompt: string,
  userPrompt: string
): Promise<AiResponse | null> {
  if (!env.OPENAI_API_KEY) {
    logger.warn("OPENAI_API_KEY not configured, using fallback");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, "OpenAI API error");
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      logger.error("No content in OpenAI response");
      return null;
    }

    return JSON.parse(content) as AiResponse;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn("OpenAI request timed out");
    } else {
      logger.error({ error }, "OpenAI request failed");
    }
    return null;
  }
}

// ============================================================================
// MAIN RECOMMENDATION FUNCTION
// ============================================================================

export async function generateBudgetRecommendations(
  month: string
): Promise<BudgetRecommendationResponse> {
  const rawHistory = await getSpendingHistoryAnalysis(month);

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: {
      fixedCommitments: true,
      plannedSpends: true,
      categoryPlans: {
        include: {
          category: {
            select: { id: true, name: true, parentId: true },
          },
        },
      },
    },
  });

  if (!budgetMonth) {
    throw new Error(`Budget month ${month} not found. Please set up the month first.`);
  }

  const history = await buildResolvedRecommendationHistory(rawHistory, budgetMonth.categoryPlans);

  const expectedIncome = toNumber(budgetMonth.expectedIncome);
  const savingsTarget = toNumber(budgetMonth.savingsTargetValue);
  const fixedCommitments = budgetMonth.fixedCommitments.reduce(
    (sum, commitment) => sum + toNumber(commitment.amount),
    0
  );
  const plannedOneOffs = budgetMonth.plannedSpends.reduce(
    (sum, plannedSpend) => sum + toNumber(plannedSpend.amount),
    0
  );
  const targetFlexibleBudget = expectedIncome - savingsTarget - fixedCommitments - plannedOneOffs;

  const context: BudgetContext = {
    expectedIncome,
    savingsTarget,
    fixedCommitments,
    plannedOneOffs,
    targetFlexibleBudget,
  };

  const inputHash = computeFullInputHash(rawHistory, context);

  let source: "ai" | "fallback" = "fallback";
  let aiModelUsed: string | null = null;
  let rawAiResponse: AiResponse | null = null;
  let categories: CategoryRecommendation[];
  let trims: TrimInfo[];
  let totalRecommendedBudget: number;
  let savingsTargetPressure: SavingsTargetPressure;
  let overallRationale: string;

  const { system, user } = buildAiPrompt(history, context);
  const aiResponse = await callOpenAi(system, user);

  if (aiResponse) {
    rawAiResponse = aiResponse;
    const validation = normalizeAndValidateRecommendations(aiResponse, history, context);

    if (validation.valid && validation.normalized) {
      source = "ai";
      aiModelUsed = "gpt-4o";

      const aiCategoryMap = new Map(validation.normalized.categories.map((category) => [category.categoryId, category]));
      const deterministicResult = generateDeterministicRecommendations(history, context);

      categories = deterministicResult.categories.map((category) => {
        const aiRecommendation = aiCategoryMap.get(category.categoryId);
        if (aiRecommendation && category.variabilityClass !== "low_signal") {
          return {
            ...category,
            recommendedBudget: aiRecommendation.recommendedBudget,
            confidence: aiRecommendation.confidence,
            rationale: aiRecommendation.rationale,
            recommendationStatus: category.recommendationStatus === "trimmed_for_savings"
              ? "trimmed_for_savings"
              : (aiRecommendation.recommendedBudget < category.historicalAverage * 0.9
                ? "trimmed_for_savings"
                : "recommended"),
          };
        }
        return category;
      });

      trims = deterministicResult.trims;
      totalRecommendedBudget = roundCurrency(
        categories
          .filter((category) => category.recommendedBudget !== null)
          .reduce((sum, category) => sum + (category.recommendedBudget ?? 0), 0)
      );
      savingsTargetPressure = deterministicResult.savingsTargetPressure;
      overallRationale = validation.normalized.overallRationale;
    } else {
      logger.info({ reason: validation.fallbackReason }, "Using deterministic fallback");
      const result = generateDeterministicRecommendations(history, context);
      categories = result.categories;
      trims = result.trims;
      totalRecommendedBudget = result.totalRecommendedBudget;
      savingsTargetPressure = result.savingsTargetPressure;
      overallRationale = result.overallRationale;
    }
  } else {
    logger.info("Using deterministic fallback (no AI response)");
    const result = generateDeterministicRecommendations(history, context);
    categories = result.categories;
    trims = result.trims;
    totalRecommendedBudget = result.totalRecommendedBudget;
    savingsTargetPressure = result.savingsTargetPressure;
    overallRationale = result.overallRationale;
  }

  const uncoveredHighSpend: UncoveredHighSpend[] = history.categories
    .filter((category) => !category.hasBudget && category.shareOfFlexibleSpend >= 5)
    .map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      historicalAverage: category.averageMonthlySpend,
      shareOfFlexibleSpend: category.shareOfFlexibleSpend,
    }));

  const normalizedResponseData = JSON.parse(JSON.stringify({
    branches: history.branches,
    categories,
    trims,
    totalRecommendedBudget,
    savingsTargetPressure,
    overallRationale,
    uncoveredHighSpend,
  }));

  const run = await prisma.budgetRecommendationRun.create({
    data: {
      month,
      inputHash,
      expectedIncome,
      savingsTarget,
      targetFlexibleBudget,
      windowMonths: history.windowMonths,
      source,
      aiModelUsed,
      rawAiResponse: rawAiResponse ? JSON.parse(JSON.stringify(rawAiResponse)) : undefined,
      normalizedResponse: normalizedResponseData,
    },
  });

  return {
    runId: run.id,
    source,
    stale: false,
    summary: {
      windowMonths: history.windowMonths,
      targetFlexibleBudget: roundCurrency(targetFlexibleBudget),
      historicalFlexibleAverage: history.averageMonthlyFlexibleSpend,
      totalRecommendedBudget,
      savingsTargetPressure,
      budgetCoveragePercent: history.budgetCoverage.coveragePercent,
      overallRationale,
    },
    branches: history.branches,
    categories,
    trims,
    uncoveredHighSpend,
    diagnostics: {
      multiCategorySpend: history.multiCategorySpend,
      multiCategoryTransactionCount: history.multiCategoryTransactionCount,
      categoriesWithInsufficientData: categories.filter(
        (category) => category.variabilityClass === "low_signal"
      ).length,
    },
  };
}

// ============================================================================
// APPLY RECOMMENDATIONS
// ============================================================================

export interface ApplySelection {
  categoryId: string;
  recommendedBudget: number;
  editedBudget?: number;
  apply: boolean;
}

export async function applyBudgetRecommendations(
  month: string,
  runId: string,
  selections: ApplySelection[]
): Promise<{ applied: number; skipped: number }> {
  const run = await prisma.budgetRecommendationRun.findUnique({
    where: { id: runId },
  });

  if (!run || run.month !== month) {
    throw new Error("Invalid recommendation run");
  }

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
  });

  if (!budgetMonth) {
    throw new Error(`Budget month ${month} not found`);
  }

  const normalizedResponse = (
    typeof run.normalizedResponse === "object" &&
    run.normalizedResponse !== null &&
    "branches" in run.normalizedResponse
  )
    ? run.normalizedResponse as { branches?: RecommendationBranch[] }
    : {};

  const branches = Array.isArray(normalizedResponse.branches)
    ? normalizedResponse.branches
    : [];
  const branchByCategoryId = new Map<string, RecommendationBranch>();

  for (const branch of branches) {
    for (const categoryId of branch.recommendedCategoryIds) {
      branchByCategoryId.set(categoryId, branch);
    }
  }

  const childModeBranchIds = new Set<string>();
  for (const selection of selections) {
    if (!selection.apply) continue;
    const branch = branchByCategoryId.get(selection.categoryId);
    if (branch?.budgetLevel === "child") {
      childModeBranchIds.add(branch.branchCategoryId);
    }
  }

  for (const branchCategoryId of childModeBranchIds) {
    await prisma.budgetCategoryPlan.deleteMany({
      where: {
        budgetMonthId: budgetMonth.id,
        categoryId: branchCategoryId,
      },
    });
  }

  let applied = 0;
  let skipped = 0;

  for (const selection of selections) {
    if (!selection.apply) {
      skipped++;
      continue;
    }

    const budget = selection.editedBudget ?? selection.recommendedBudget;

    await prisma.budgetCategoryPlan.upsert({
      where: {
        budgetMonthId_categoryId: {
          budgetMonthId: budgetMonth.id,
          categoryId: selection.categoryId,
        },
      },
      update: {
        targetValue: budget,
        targetType: "fixed",
      },
      create: {
        budgetMonthId: budgetMonth.id,
        categoryId: selection.categoryId,
        targetValue: budget,
        targetType: "fixed",
      },
    });

    applied++;
  }

  await prisma.budgetRecommendationRun.update({
    where: { id: runId },
    data: {
      appliedAt: new Date(),
      appliedSelections: selections as object[],
    },
  });

  return { applied, skipped };
}

// ============================================================================
// CHECK STALENESS
// ============================================================================

export async function checkRecommendationStaleness(
  runId: string
): Promise<{ stale: boolean; currentHash: string; storedHash: string }> {
  const run = await prisma.budgetRecommendationRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const history = await getSpendingHistoryAnalysis(run.month);

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: run.month },
    include: {
      fixedCommitments: true,
      plannedSpends: true,
    },
  });

  if (!budgetMonth) {
    return { stale: true, currentHash: "", storedHash: run.inputHash };
  }

  const expectedIncome = toNumber(budgetMonth.expectedIncome);
  const savingsTarget = toNumber(budgetMonth.savingsTargetValue);
  const fixedCommitments = budgetMonth.fixedCommitments.reduce(
    (sum, commitment) => sum + toNumber(commitment.amount),
    0
  );
  const plannedOneOffs = budgetMonth.plannedSpends.reduce(
    (sum, plannedSpend) => sum + toNumber(plannedSpend.amount),
    0
  );

  const currentHash = computeFullInputHash(history, {
    expectedIncome,
    savingsTarget,
    fixedCommitments,
    plannedOneOffs,
  });

  return {
    stale: currentHash !== run.inputHash,
    currentHash,
    storedHash: run.inputHash,
  };
}
