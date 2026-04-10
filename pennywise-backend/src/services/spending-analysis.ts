import { prisma } from "../lib/prisma.js";
import {
  getMonthlyBudgetPace,
  type CategoryPaceStatus,
  type MonthlyBudgetPace,
} from "./budget.js";

export type AnalysisPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "ytd"
  | "custom";

export interface SpendingAnalysisFilters {
  start: string;
  end: string;
  compare?: boolean;
  preset?: AnalysisPreset;
  accountId?: string;
  categoryId?: string;
  includeIgnored?: boolean;
}

export interface AnalysisCategoryBudget {
  monthlyBudget: number | null;
  expectedSpendByNow: number | null;
  remainingBudget: number | null;
  paceDelta: number | null;
  status: CategoryPaceStatus | null;
}

export interface AnalysisBudgetContext {
  applicable: boolean;
  month: string | null;
  hasBudget: boolean;
  overall: MonthlyBudgetPace["overall"] | null;
}

export interface AnalysisPeriod {
  start: string;
  end: string;
  dayCount: number;
}

export interface AnalysisSummary {
  totalSpend: number;
  previousTotalSpend: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  avgPerDay: number;
  transactionCount: number;
  recurringSpend: number;
  highestCategory: {
    categoryId: string;
    categoryName: string;
    spend: number;
  } | null;
}

export interface AnalysisTimeSeriesPoint {
  index: number;
  label: string;
  currentDate: string;
  previousDate: string | null;
  currentSpend: number;
  previousSpend: number | null;
  currentCumulative: number;
  previousCumulative: number | null;
}

export interface AnalysisMerchantRow {
  merchant: string;
  spend: number;
  transactionCount: number;
  averageTransaction: number;
}

export interface CategoryAnalysisRow {
  categoryId: string;
  categoryName: string;
  spend: number;
  previousSpend: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  shareOfTotal: number;
  transactionCount: number;
  averageTransaction: number;
  sparkline: number[];
  budget: AnalysisCategoryBudget | null;
}

export interface SpendingAnalysisResponse {
  currentPeriod: AnalysisPeriod;
  previousPeriod: AnalysisPeriod | null;
  budgetContext: AnalysisBudgetContext;
  summary: AnalysisSummary;
  series: AnalysisTimeSeriesPoint[];
  categories: CategoryAnalysisRow[];
  topMerchants: AnalysisMerchantRow[];
}

export interface CategoryDrilldownResponse {
  currentPeriod: AnalysisPeriod;
  previousPeriod: AnalysisPeriod | null;
  budget: AnalysisCategoryBudget | null;
  category: {
    categoryId: string;
    categoryName: string;
    spend: number;
    previousSpend: number | null;
    changeAmount: number | null;
    changePercent: number | null;
    transactionCount: number;
    averageTransaction: number;
  };
  series: AnalysisTimeSeriesPoint[];
  topMerchants: AnalysisMerchantRow[];
  largestTransactions: Array<{
    transactionId: string;
    transactionDate: string;
    merchantName: string | null;
    description: string;
    amount: number;
  }>;
  monthlyHistory: Array<{
    month: string;
    label: string;
    spend: number;
  }>;
  recurringSplit: {
    recurringSpend: number;
    recurringTransactionCount: number;
    oneOffSpend: number;
    oneOffTransactionCount: number;
  };
  weekdayWeekendSplit: {
    weekdaySpend: number;
    weekendSpend: number;
    weekdayTransactionCount: number;
    weekendTransactionCount: number;
  };
}

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface CategoryWithAncestry extends CategoryNode {
  depth: number;
}

interface AttributedTransaction {
  id: string;
  transactionDate: Date;
  transactionDateKey: string;
  amount: number;
  description: string;
  merchantName: string | null;
  normalizedMerchant: string | null;
  merchantKey: string;
  categoryId: string;
  rootCategoryId: string;
  rootCategoryName: string;
}

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

function parseStartDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return parsed;
}

function parseEndDate(date: string): Date {
  const parsed = new Date(`${date}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return parsed;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function differenceInCalendarDays(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

function getInclusiveDayCount(start: Date, end: Date): number {
  return differenceInCalendarDays(start, end) + 1;
}

function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getMonthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function shiftMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function getPreviousPeriod(
  start: Date,
  end: Date,
  preset: AnalysisPreset | undefined
): { start: Date; end: Date } {
  const dayCount = getInclusiveDayCount(start, end);

  if (preset === "this_month") {
    const previousMonth = shiftMonths(start, -1);
    const previousStart = getMonthStart(previousMonth);
    const previousEnd = addDays(previousStart, dayCount - 1);
    return { start: previousStart, end: previousEnd };
  }

  if (preset === "last_month") {
    const previousMonth = shiftMonths(start, -1);
    return {
      start: getMonthStart(previousMonth),
      end: getMonthEnd(previousMonth),
    };
  }

  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(dayCount - 1));
  return { start: previousStart, end: previousEnd };
}

async function buildCategoryAncestryMap(): Promise<Map<string, CategoryWithAncestry>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const ancestryMap = new Map<string, CategoryWithAncestry>();

  function getDepth(categoryId: string): number {
    let depth = 0;
    let current = categoryMap.get(categoryId);

    while (current?.parentId) {
      depth += 1;
      current = categoryMap.get(current.parentId);
    }

    return depth;
  }

  for (const category of categories) {
    ancestryMap.set(category.id, {
      ...category,
      depth: getDepth(category.id),
    });
  }

  return ancestryMap;
}

function isDescendantOf(
  categoryId: string,
  potentialAncestorId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): boolean {
  let current = ancestryMap.get(categoryId);

  while (current?.parentId) {
    if (current.parentId === potentialAncestorId) {
      return true;
    }
    current = ancestryMap.get(current.parentId);
  }

  return false;
}

function resolveMultiCategoryTransaction(
  directCategoryIds: string[],
  ancestryMap: Map<string, CategoryWithAncestry>
): string | null {
  if (directCategoryIds.length === 0) {
    return null;
  }

  if (directCategoryIds.length === 1) {
    return directCategoryIds[0];
  }

  const withDepth = directCategoryIds
    .map((id) => ({ id, depth: ancestryMap.get(id)?.depth ?? 0 }))
    .sort((a, b) => b.depth - a.depth);

  const deepest = withDepth[0];

  for (const other of withDepth.slice(1)) {
    if (isDescendantOf(deepest.id, other.id, ancestryMap)) {
      return deepest.id;
    }
  }

  return null;
}

function getRootCategoryId(
  categoryId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): string {
  let current = ancestryMap.get(categoryId);

  while (current?.parentId) {
    current = ancestryMap.get(current.parentId);
  }

  return current?.id ?? categoryId;
}

function buildDescendantSet(
  targetCategoryId: string,
  categories: Map<string, CategoryWithAncestry>
): Set<string> {
  const descendants = new Set<string>([targetCategoryId]);

  for (const [categoryId] of categories) {
    if (categoryId !== targetCategoryId && isDescendantOf(categoryId, targetCategoryId, categories)) {
      descendants.add(categoryId);
    }
  }

  return descendants;
}

async function getAttributedTransactions(
  range: { start: Date; end: Date },
  filters: Pick<SpendingAnalysisFilters, "accountId" | "categoryId" | "includeIgnored">,
  ancestryMap: Map<string, CategoryWithAncestry>
): Promise<AttributedTransaction[]> {
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: range.start, lte: range.end },
      pending: false,
      amount: { lt: 0 },
      ...(filters.includeIgnored ? {} : { isIgnored: false }),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      merchantName: true,
      normalizedMerchant: true,
      categories: {
        where: { source: { not: "inherited" } },
        select: { categoryId: true },
      },
    },
    orderBy: { transactionDate: "asc" },
  });

  const descendantSet = filters.categoryId
    ? buildDescendantSet(filters.categoryId, ancestryMap)
    : null;

  const attributed: AttributedTransaction[] = [];

  for (const transaction of rawTransactions) {
    const resolvedCategoryId = resolveMultiCategoryTransaction(
      transaction.categories.map((category) => category.categoryId),
      ancestryMap
    );

    if (!resolvedCategoryId) {
      continue;
    }

    if (descendantSet && !descendantSet.has(resolvedCategoryId)) {
      continue;
    }

    const rootCategoryId = getRootCategoryId(resolvedCategoryId, ancestryMap);
    const rootCategory = ancestryMap.get(rootCategoryId);

    attributed.push({
      id: transaction.id,
      transactionDate: transaction.transactionDate,
      transactionDateKey: formatDateKey(transaction.transactionDate),
      amount: Math.abs(toNumber(transaction.amount)),
      description: transaction.description,
      merchantName: transaction.merchantName,
      normalizedMerchant: transaction.normalizedMerchant,
      merchantKey:
        transaction.normalizedMerchant || transaction.merchantName || transaction.description.slice(0, 80),
      categoryId: resolvedCategoryId,
      rootCategoryId,
      rootCategoryName: rootCategory?.name ?? ancestryMap.get(resolvedCategoryId)?.name ?? "Uncategorised",
    });
  }

  return attributed;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildTimeSeries(
  currentTransactions: AttributedTransaction[],
  currentPeriod: { start: Date; end: Date },
  previousTransactions: AttributedTransaction[],
  previousPeriod: { start: Date; end: Date } | null
): AnalysisTimeSeriesPoint[] {
  const currentDates: string[] = [];
  const currentSpendMap = new Map<string, number>();
  const previousSpendMap = new Map<string, number>();

  for (let cursor = new Date(currentPeriod.start); cursor <= currentPeriod.end; cursor = addDays(cursor, 1)) {
    currentDates.push(formatDateKey(cursor));
  }

  for (const transaction of currentTransactions) {
    currentSpendMap.set(
      transaction.transactionDateKey,
      (currentSpendMap.get(transaction.transactionDateKey) || 0) + transaction.amount
    );
  }

  if (previousPeriod) {
    for (const transaction of previousTransactions) {
      previousSpendMap.set(
        transaction.transactionDateKey,
        (previousSpendMap.get(transaction.transactionDateKey) || 0) + transaction.amount
      );
    }
  }

  let currentCumulative = 0;
  let previousCumulative = 0;

  return currentDates.map((dateKey, index) => {
    const currentSpend = roundCurrency(currentSpendMap.get(dateKey) || 0);
    currentCumulative = roundCurrency(currentCumulative + currentSpend);

    let previousDateKey: string | null = null;
    let previousSpend: number | null = null;
    let previousCumulativeValue: number | null = null;

    if (previousPeriod) {
      previousDateKey = formatDateKey(addDays(previousPeriod.start, index));
      previousSpend = roundCurrency(previousSpendMap.get(previousDateKey) || 0);
      previousCumulative = roundCurrency(previousCumulative + previousSpend);
      previousCumulativeValue = previousCumulative;
    }

    return {
      index,
      label: new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-GB", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      currentDate: dateKey,
      previousDate: previousDateKey,
      currentSpend,
      previousSpend,
      currentCumulative,
      previousCumulative: previousCumulativeValue,
    };
  });
}

function getBucketIndex(date: Date, start: Date, dayCount: number, bucketCount: number): number {
  if (bucketCount <= 1) return 0;

  const dayOffset = Math.max(0, differenceInCalendarDays(start, date));
  return Math.min(bucketCount - 1, Math.floor((dayOffset / Math.max(dayCount, 1)) * bucketCount));
}

function buildSparkline(
  transactions: AttributedTransaction[],
  start: Date,
  end: Date
): number[] {
  const dayCount = getInclusiveDayCount(start, end);
  const bucketCount = Math.min(12, Math.max(1, dayCount));
  const buckets = Array.from({ length: bucketCount }, () => 0);

  for (const transaction of transactions) {
    const bucketIndex = getBucketIndex(transaction.transactionDate, start, dayCount, bucketCount);
    buckets[bucketIndex] += transaction.amount;
  }

  return buckets.map(roundCurrency);
}

function getChangeMetrics(current: number, previous: number | null): {
  changeAmount: number | null;
  changePercent: number | null;
} {
  if (previous === null) {
    return { changeAmount: null, changePercent: null };
  }

  const changeAmount = roundCurrency(current - previous);

  if (previous === 0) {
    return {
      changeAmount,
      changePercent: current === 0 ? 0 : null,
    };
  }

  return {
    changeAmount,
    changePercent: roundCurrency(((current - previous) / previous) * 100),
  };
}

function buildMerchantRows(transactions: AttributedTransaction[], limit: number): AnalysisMerchantRow[] {
  const merchantTotals = new Map<string, { spend: number; transactionCount: number }>();

  for (const transaction of transactions) {
    const key = transaction.merchantKey;
    const entry = merchantTotals.get(key) || { spend: 0, transactionCount: 0 };
    entry.spend += transaction.amount;
    entry.transactionCount += 1;
    merchantTotals.set(key, entry);
  }

  return [...merchantTotals.entries()]
    .map(([merchant, entry]) => ({
      merchant,
      spend: roundCurrency(entry.spend),
      transactionCount: entry.transactionCount,
      averageTransaction: roundCurrency(entry.spend / entry.transactionCount),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function getAmountVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;

  const squaredDiffs = values.map((value) => (value - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function isRecurringMerchant(transactions: AttributedTransaction[]): boolean {
  if (transactions.length < 2) {
    return false;
  }

  const sorted = [...transactions].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()
  );
  const distinctMonths = new Set(sorted.map((transaction) => formatMonthKey(transaction.transactionDate)));

  if (distinctMonths.size < 2) {
    return false;
  }

  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    gaps.push(differenceInCalendarDays(sorted[index - 1].transactionDate, sorted[index].transactionDate));
  }

  const medianGap = calculateMedian(gaps);
  const amountVariance = getAmountVariance(sorted.map((transaction) => transaction.amount));

  return medianGap >= 20 && medianGap <= 40 && amountVariance <= 0.25;
}

function buildRecurringMerchantSet(history: AttributedTransaction[]): Set<string> {
  const merchants = new Map<string, AttributedTransaction[]>();

  for (const transaction of history) {
    const group = merchants.get(transaction.merchantKey) || [];
    group.push(transaction);
    merchants.set(transaction.merchantKey, group);
  }

  const recurring = new Set<string>();

  for (const [merchantKey, transactions] of merchants) {
    if (isRecurringMerchant(transactions)) {
      recurring.add(merchantKey);
    }
  }

  return recurring;
}

function buildBudgetContext(
  filters: SpendingAnalysisFilters,
  pace: MonthlyBudgetPace | null
): AnalysisBudgetContext {
  const start = parseStartDate(filters.start);
  const end = parseEndDate(filters.end);
  const isSingleMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  const applicable = filters.preset !== "custom" && isSingleMonth;
  const month = applicable ? formatMonthKey(start) : null;

  return {
    applicable,
    month,
    hasBudget: applicable && !!pace,
    overall: applicable ? pace?.overall ?? null : null,
  };
}

function buildBudgetByCategory(
  budgetContext: AnalysisBudgetContext,
  pace: MonthlyBudgetPace | null
): Map<string, AnalysisCategoryBudget> {
  const budgetByCategory = new Map<string, AnalysisCategoryBudget>();

  if (!budgetContext.applicable || !pace) {
    return budgetByCategory;
  }

  for (const category of pace.categories) {
    budgetByCategory.set(category.categoryId, {
      monthlyBudget: category.monthlyBudget,
      expectedSpendByNow: category.expectedSpendByNow,
      remainingBudget: category.remainingBudget,
      paceDelta: category.paceDelta,
      status: category.status,
    });
  }

  return budgetByCategory;
}

async function getPaceForFilters(filters: SpendingAnalysisFilters): Promise<MonthlyBudgetPace | null> {
  const start = parseStartDate(filters.start);
  const end = parseEndDate(filters.end);
  const isSingleMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (!isSingleMonth || filters.preset === "custom") {
    return null;
  }

  return getMonthlyBudgetPace(formatMonthKey(start));
}

function getPeriodMeta(start: Date, end: Date): AnalysisPeriod {
  return {
    start: formatDateKey(start),
    end: formatDateKey(end),
    dayCount: getInclusiveDayCount(start, end),
  };
}

export async function getSpendingAnalysis(
  filters: SpendingAnalysisFilters
): Promise<SpendingAnalysisResponse> {
  const ancestryMap = await buildCategoryAncestryMap();
  const currentRange = {
    start: parseStartDate(filters.start),
    end: parseEndDate(filters.end),
  };

  const previousRange = filters.compare
    ? getPreviousPeriod(currentRange.start, currentRange.end, filters.preset)
    : null;

  const lookbackRange = {
    start: addDays(currentRange.start, -180),
    end: currentRange.end,
  };

  const [currentTransactions, previousTransactions, recurringHistory, pace] = await Promise.all([
    getAttributedTransactions(currentRange, filters, ancestryMap),
    previousRange ? getAttributedTransactions(previousRange, filters, ancestryMap) : Promise.resolve([]),
    getAttributedTransactions(lookbackRange, filters, ancestryMap),
    getPaceForFilters(filters),
  ]);

  const budgetContext = buildBudgetContext(filters, pace);
  const budgetByCategory = buildBudgetByCategory(budgetContext, pace);
  const recurringMerchants = buildRecurringMerchantSet(recurringHistory);
  const previousByCategory = new Map<string, { spend: number; transactionCount: number }>();

  for (const transaction of previousTransactions) {
    const existing = previousByCategory.get(transaction.rootCategoryId) || {
      spend: 0,
      transactionCount: 0,
    };
    existing.spend += transaction.amount;
    existing.transactionCount += 1;
    previousByCategory.set(transaction.rootCategoryId, existing);
  }

  const currentByCategory = new Map<
    string,
    {
      categoryName: string;
      spend: number;
      transactionCount: number;
      transactions: AttributedTransaction[];
    }
  >();

  for (const transaction of currentTransactions) {
    const existing = currentByCategory.get(transaction.rootCategoryId) || {
      categoryName: transaction.rootCategoryName,
      spend: 0,
      transactionCount: 0,
      transactions: [] as AttributedTransaction[],
    };
    existing.spend += transaction.amount;
    existing.transactionCount += 1;
    existing.transactions.push(transaction);
    currentByCategory.set(transaction.rootCategoryId, existing);
  }

  const totalSpend = roundCurrency(
    currentTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  );
  const previousTotalSpend = previousRange
    ? roundCurrency(previousTransactions.reduce((sum, transaction) => sum + transaction.amount, 0))
    : null;
  const recurringSpend = roundCurrency(
    currentTransactions
      .filter((transaction) => recurringMerchants.has(transaction.merchantKey))
      .reduce((sum, transaction) => sum + transaction.amount, 0)
  );

  const categories: CategoryAnalysisRow[] = [...currentByCategory.entries()]
    .map(([categoryId, entry]) => {
      const previous = previousByCategory.get(categoryId);
      const previousSpend = previous ? roundCurrency(previous.spend) : filters.compare ? 0 : null;
      const change = getChangeMetrics(roundCurrency(entry.spend), previousSpend);

      return {
        categoryId,
        categoryName: entry.categoryName,
        spend: roundCurrency(entry.spend),
        previousSpend,
        changeAmount: change.changeAmount,
        changePercent: change.changePercent,
        shareOfTotal: totalSpend > 0 ? roundCurrency((entry.spend / totalSpend) * 100) : 0,
        transactionCount: entry.transactionCount,
        averageTransaction: roundCurrency(entry.spend / entry.transactionCount),
        sparkline: buildSparkline(entry.transactions, currentRange.start, currentRange.end),
        budget: budgetByCategory.get(categoryId) ?? null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const highestCategory = categories[0]
    ? {
        categoryId: categories[0].categoryId,
        categoryName: categories[0].categoryName,
        spend: categories[0].spend,
      }
    : null;

  const change = getChangeMetrics(totalSpend, previousTotalSpend);

  return {
    currentPeriod: getPeriodMeta(currentRange.start, currentRange.end),
    previousPeriod: previousRange ? getPeriodMeta(previousRange.start, previousRange.end) : null,
    budgetContext,
    summary: {
      totalSpend,
      previousTotalSpend,
      changeAmount: change.changeAmount,
      changePercent: change.changePercent,
      avgPerDay: roundCurrency(totalSpend / getInclusiveDayCount(currentRange.start, currentRange.end)),
      transactionCount: currentTransactions.length,
      recurringSpend,
      highestCategory,
    },
    series: buildTimeSeries(currentTransactions, currentRange, previousTransactions, previousRange),
    categories,
    topMerchants: buildMerchantRows(currentTransactions, 8),
  };
}

export async function getCategoryDrilldown(
  categoryId: string,
  filters: SpendingAnalysisFilters
): Promise<CategoryDrilldownResponse | null> {
  const ancestryMap = await buildCategoryAncestryMap();
  const category = ancestryMap.get(categoryId);

  if (!category) {
    return null;
  }

  const descendantSet = buildDescendantSet(categoryId, ancestryMap);
  const currentRange = {
    start: parseStartDate(filters.start),
    end: parseEndDate(filters.end),
  };
  const previousRange = filters.compare
    ? getPreviousPeriod(currentRange.start, currentRange.end, filters.preset)
    : null;

  const historyStart = getMonthStart(shiftMonths(currentRange.end, -5));
  const lookbackRange = {
    start: addDays(currentRange.start, -180),
    end: currentRange.end,
  };

  const [currentTransactions, previousTransactions, recurringHistory, historyTransactions, pace] =
    await Promise.all([
      getAttributedTransactions(currentRange, filters, ancestryMap),
      previousRange ? getAttributedTransactions(previousRange, filters, ancestryMap) : Promise.resolve([]),
      getAttributedTransactions(lookbackRange, filters, ancestryMap),
      getAttributedTransactions({ start: historyStart, end: currentRange.end }, filters, ancestryMap),
      getPaceForFilters(filters),
    ]);

  const filterCategoryTransactions = (transactions: AttributedTransaction[]) =>
    transactions.filter((transaction) => descendantSet.has(transaction.categoryId));

  const currentCategoryTransactions = filterCategoryTransactions(currentTransactions);
  const previousCategoryTransactions = filterCategoryTransactions(previousTransactions);
  const recurringCategoryHistory = filterCategoryTransactions(recurringHistory);
  const historyCategoryTransactions = filterCategoryTransactions(historyTransactions);
  const budgetContext = buildBudgetContext(filters, pace);
  const budgetByCategory = buildBudgetByCategory(budgetContext, pace);
  const recurringMerchants = buildRecurringMerchantSet(recurringCategoryHistory);

  const currentSpend = roundCurrency(
    currentCategoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  );
  const previousSpend = previousRange
    ? roundCurrency(previousCategoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0))
    : null;
  const change = getChangeMetrics(currentSpend, previousSpend);

  const recurringTransactions = currentCategoryTransactions.filter((transaction) =>
    recurringMerchants.has(transaction.merchantKey)
  );
  const recurringSpend = roundCurrency(
    recurringTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  );

  const weekdayWeekendSplit = currentCategoryTransactions.reduce(
    (result, transaction) => {
      const day = transaction.transactionDate.getUTCDay();
      const isWeekend = day === 0 || day === 6;

      if (isWeekend) {
        result.weekendSpend += transaction.amount;
        result.weekendTransactionCount += 1;
      } else {
        result.weekdaySpend += transaction.amount;
        result.weekdayTransactionCount += 1;
      }

      return result;
    },
    {
      weekdaySpend: 0,
      weekendSpend: 0,
      weekdayTransactionCount: 0,
      weekendTransactionCount: 0,
    }
  );

  const monthlyHistory = (() => {
    const months: string[] = [];
    const totals = new Map<string, number>();
    const startMonth = getMonthStart(historyStart);
    const endMonth = getMonthStart(currentRange.end);

    for (let cursor = new Date(startMonth); cursor <= endMonth; cursor = shiftMonths(cursor, 1)) {
      const monthKey = formatMonthKey(cursor);
      months.push(monthKey);
      totals.set(monthKey, 0);
    }

    for (const transaction of historyCategoryTransactions) {
      const monthKey = formatMonthKey(transaction.transactionDate);
      totals.set(monthKey, (totals.get(monthKey) || 0) + transaction.amount);
    }

    return months.map((month) => ({
      month,
      label: formatMonthLabel(month),
      spend: roundCurrency(totals.get(month) || 0),
    }));
  })();

  return {
    currentPeriod: getPeriodMeta(currentRange.start, currentRange.end),
    previousPeriod: previousRange ? getPeriodMeta(previousRange.start, previousRange.end) : null,
    budget: budgetByCategory.get(categoryId) ?? null,
    category: {
      categoryId,
      categoryName: category.name,
      spend: currentSpend,
      previousSpend,
      changeAmount: change.changeAmount,
      changePercent: change.changePercent,
      transactionCount: currentCategoryTransactions.length,
      averageTransaction:
        currentCategoryTransactions.length > 0
          ? roundCurrency(currentSpend / currentCategoryTransactions.length)
          : 0,
    },
    series: buildTimeSeries(
      currentCategoryTransactions,
      currentRange,
      previousCategoryTransactions,
      previousRange
    ),
    topMerchants: buildMerchantRows(currentCategoryTransactions, 6),
    largestTransactions: [...currentCategoryTransactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((transaction) => ({
        transactionId: transaction.id,
        transactionDate: transaction.transactionDateKey,
        merchantName: transaction.normalizedMerchant || transaction.merchantName,
        description: transaction.description,
        amount: roundCurrency(transaction.amount),
      })),
    monthlyHistory,
    recurringSplit: {
      recurringSpend,
      recurringTransactionCount: recurringTransactions.length,
      oneOffSpend: roundCurrency(currentSpend - recurringSpend),
      oneOffTransactionCount: currentCategoryTransactions.length - recurringTransactions.length,
    },
    weekdayWeekendSplit: {
      weekdaySpend: roundCurrency(weekdayWeekendSplit.weekdaySpend),
      weekendSpend: roundCurrency(weekdayWeekendSplit.weekendSpend),
      weekdayTransactionCount: weekdayWeekendSplit.weekdayTransactionCount,
      weekendTransactionCount: weekdayWeekendSplit.weekendTransactionCount,
    },
  };
}
