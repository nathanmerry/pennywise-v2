import {
  getMonthlyBudgetPace,
  type CategoryPaceStatus,
  type MonthlyBudgetPace,
} from "./budget.js";
import {
  buildCategoryAncestryMap,
  buildDescendantSet,
  getRootCategoryId,
} from "./reporting/category-attribution.js";
import {
  getCategoryResolvedOutflows,
  getReportableOutflows,
  type CategoryResolvedOutflow,
  type ReportableOutflow,
} from "./reporting/reportable-transactions.js";
import {
  getCategoryBudgetRoleMap,
  getFixedCategoryMap,
  type FixedCategoryEntry,
  type CategoryBudgetRole,
} from "./reporting/budget-role.js";

/**
 * Sentinel category ids for txs that don't resolve to a single safe category
 * (uncategorised + ambiguous multi-category). Surfaced as synthetic rows in
 * the breakdown so the spend totals tally with pace's bank-statement view.
 * getCategoryDrilldown handles these ids specially so the frontend can drill in
 * and list the underlying transactions.
 */
const UNATTRIBUTED_FLEXIBLE_ID = "__unattributed_flexible__";
const UNATTRIBUTED_FIXED_ID = "__unattributed_fixed__";

/**
 * Split reportable outflows that aren't in the resolved (single-safe-category)
 * set into flexible vs fixed buckets, using pace's fixed-vs-flexible role map.
 * Shared by the breakdown (getSpendingAnalysis) and the drilldown so both agree
 * on exactly which transactions are "unattributed".
 */
function splitUnattributedOutflows(
  reportableOutflows: ReportableOutflow[],
  resolvedTransactionIds: Set<string>,
  roleMap: Map<string, CategoryBudgetRole> | null,
): { flexible: ReportableOutflow[]; fixed: ReportableOutflow[] } {
  const flexible: ReportableOutflow[] = [];
  const fixed: ReportableOutflow[] = [];
  for (const tx of reportableOutflows) {
    if (resolvedTransactionIds.has(tx.id)) continue;
    const isFixed = roleMap
      ? tx.categoryIds.some((id) => roleMap.get(id) === "fixed")
      : false;
    (isFixed ? fixed : flexible).push(tx);
  }
  return { flexible, fixed };
}

export type AnalysisPreset =
  | "this_cycle"
  | "last_cycle"
  | "last_3_cycles"
  | "last_6_cycles"
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

export interface AnalysisPaceContext {
  totalDaysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  elapsedRatio: number;
  isCurrentMonth: boolean;
}

export interface AnalysisBudgetContext {
  applicable: boolean;
  month: string | null;
  hasBudget: boolean;
  overall: MonthlyBudgetPace["overall"] | null;
  paceContext: AnalysisPaceContext | null;
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
  flexibleSpend: number;
  fixedSpend: number;
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
  kind: "fixed" | "flexible";
  spend: number;
  previousSpend: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  shareOfTotal: number;
  transactionCount: number;
  averageTransaction: number;
  sparkline: number[];
  budget: AnalysisCategoryBudget | null;
  plannedAmount: number | null;
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
  transactions: Array<{
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

function shiftMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function getPreviousPeriod(
  start: Date,
  end: Date,
  _preset: AnalysisPreset | undefined
): { start: Date; end: Date } {
  const dayCount = getInclusiveDayCount(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(dayCount - 1));
  return { start: previousStart, end: previousEnd };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildTimeSeries(
  currentTransactions: CategoryResolvedOutflow[],
  currentPeriod: { start: Date; end: Date },
  previousTransactions: CategoryResolvedOutflow[],
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
  transactions: CategoryResolvedOutflow[],
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

function buildMerchantRows(transactions: CategoryResolvedOutflow[], limit: number): AnalysisMerchantRow[] {
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

function isRecurringMerchant(transactions: CategoryResolvedOutflow[]): boolean {
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

function buildRecurringMerchantSet(history: CategoryResolvedOutflow[]): Set<string> {
  const merchants = new Map<string, CategoryResolvedOutflow[]>();

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
  const end = parseEndDate(filters.end);
  const isSingleCycle =
    filters.preset === "this_cycle" || filters.preset === "last_cycle";

  const applicable = isSingleCycle;
  const month = applicable ? formatMonthKey(end) : null;

  const paceContext: AnalysisPaceContext | null =
    applicable && pace
      ? {
          totalDaysInMonth: pace.totalDaysInMonth,
          elapsedDays: pace.elapsedDays,
          remainingDays: pace.remainingDays,
          elapsedRatio: pace.elapsedRatio,
          isCurrentMonth: pace.isCurrentMonth,
        }
      : null;

  return {
    applicable,
    month,
    hasBudget: applicable && !!pace,
    overall: applicable ? pace?.overall ?? null : null,
    paceContext,
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
  if (filters.preset !== "this_cycle" && filters.preset !== "last_cycle") {
    return null;
  }

  const end = parseEndDate(filters.end);
  return getMonthlyBudgetPace(formatMonthKey(end));
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

  const [currentTransactions, currentReportableOutflows, previousTransactions, recurringHistory, pace] = await Promise.all([
    getCategoryResolvedOutflows(
      { startDate: currentRange.start, endDate: currentRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
      ancestryMap,
    ),
    getReportableOutflows(
      { startDate: currentRange.start, endDate: currentRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
      ancestryMap,
    ),
    previousRange
      ? getCategoryResolvedOutflows(
          { startDate: previousRange.start, endDate: previousRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
          ancestryMap,
        )
      : Promise.resolve([]),
    getCategoryResolvedOutflows(
      { startDate: lookbackRange.start, endDate: lookbackRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
      ancestryMap,
    ),
    getPaceForFilters(filters),
  ]);

  const budgetContext = buildBudgetContext(filters, pace);
  const budgetByCategory = buildBudgetByCategory(budgetContext, pace);
  const recurringMerchants = buildRecurringMerchantSet(recurringHistory);
  const fixedCategoryMap = budgetContext.month
    ? await getFixedCategoryMap(budgetContext.month, ancestryMap)
    : new Map<string, FixedCategoryEntry>();
  // Per-category role map mirrors pace's fixed-vs-flexible split exactly, so
  // unattributed txs land in the same bucket they'd land in for pace.
  const roleMap = budgetContext.month
    ? await getCategoryBudgetRoleMap(budgetContext.month, ancestryMap)
    : null;
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
      transactions: CategoryResolvedOutflow[];
    }
  >();

  // Seed every budgeted (flexible) category root so categories with a budget
  // but no spend in the period still render — the breakdown should reflect
  // every plan, not just where money has flowed.
  if (pace) {
    for (const category of pace.categories) {
      const rootCategoryId = getRootCategoryId(category.categoryId, ancestryMap);
      if (currentByCategory.has(rootCategoryId)) continue;
      const rootName = ancestryMap.get(rootCategoryId)?.name ?? category.categoryName;
      currentByCategory.set(rootCategoryId, {
        categoryName: rootName,
        spend: 0,
        transactionCount: 0,
        transactions: [],
      });
    }
  }

  for (const transaction of currentTransactions) {
    const existing = currentByCategory.get(transaction.rootCategoryId) || {
      categoryName: transaction.rootCategoryName,
      spend: 0,
      transactionCount: 0,
      transactions: [] as CategoryResolvedOutflow[],
    };
    existing.spend += transaction.amount;
    existing.transactionCount += 1;
    existing.transactions.push(transaction);
    currentByCategory.set(transaction.rootCategoryId, existing);
  }

  // Unattributed bucket: every reportable outflow that isn't in the resolved
  // set (uncategorised + ambiguous multi-category). Split by pace's
  // fixed-vs-flexible rule so headline totals tally with /budget/pace.
  const { flexible: unattributedFlexible, fixed: unattributedFixed } =
    splitUnattributedOutflows(
      currentReportableOutflows,
      new Set(currentTransactions.map((tx) => tx.id)),
      roleMap,
    );

  const sumOutflows = (rows: ReportableOutflow[]) =>
    rows.reduce((sum, row) => sum + row.amount, 0);
  const unattributedFlexibleSpend = sumOutflows(unattributedFlexible);
  const unattributedFixedSpend = sumOutflows(unattributedFixed);

  const totalSpend = roundCurrency(
    currentTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
      + unattributedFlexibleSpend
      + unattributedFixedSpend
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
      const fixed = fixedCategoryMap.get(categoryId);
      const kind: "fixed" | "flexible" = fixed ? "fixed" : "flexible";

      return {
        categoryId,
        categoryName: entry.categoryName,
        kind,
        spend: roundCurrency(entry.spend),
        previousSpend,
        changeAmount: change.changeAmount,
        changePercent: change.changePercent,
        shareOfTotal: totalSpend > 0 ? roundCurrency((entry.spend / totalSpend) * 100) : 0,
        transactionCount: entry.transactionCount,
        averageTransaction: roundCurrency(entry.spend / entry.transactionCount),
        sparkline: buildSparkline(entry.transactions, currentRange.start, currentRange.end),
        budget: kind === "fixed" ? null : budgetByCategory.get(categoryId) ?? null,
        plannedAmount: fixed ? roundCurrency(fixed.plannedAmount) : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const buildUnattributedRow = (
    categoryId: string,
    name: string,
    kind: "fixed" | "flexible",
    rows: ReportableOutflow[],
  ): CategoryAnalysisRow | null => {
    if (rows.length === 0) return null;
    const spend = roundCurrency(sumOutflows(rows));
    return {
      categoryId,
      categoryName: name,
      kind,
      spend,
      previousSpend: filters.compare ? 0 : null,
      changeAmount: null,
      changePercent: null,
      shareOfTotal: totalSpend > 0 ? roundCurrency((spend / totalSpend) * 100) : 0,
      transactionCount: rows.length,
      averageTransaction: roundCurrency(spend / rows.length),
      sparkline: [],
      budget: null,
      plannedAmount: null,
    };
  };

  const unattributedRows = [
    buildUnattributedRow(UNATTRIBUTED_FLEXIBLE_ID, "Unattributed (flexible)", "flexible", unattributedFlexible),
    buildUnattributedRow(UNATTRIBUTED_FIXED_ID, "Unattributed (fixed)", "fixed", unattributedFixed),
  ].filter((row): row is CategoryAnalysisRow => row !== null);

  categories.push(...unattributedRows);

  const fixedSpend = roundCurrency(
    categories
      .filter((category) => category.kind === "fixed")
      .reduce((sum, category) => sum + category.spend, 0)
  );
  const flexibleSpend = roundCurrency(totalSpend - fixedSpend);

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
      flexibleSpend,
      fixedSpend,
      highestCategory,
    },
    series: buildTimeSeries(currentTransactions, currentRange, previousTransactions, previousRange),
    categories,
    topMerchants: buildMerchantRows(currentTransactions, 8),
  };
}

/**
 * Drilldown for the synthetic unattributed buckets: lists the reportable
 * outflows that didn't resolve to a single safe category (uncategorised +
 * ambiguous multi-category), split fixed/flexible the same way the breakdown
 * does. Analysis-heavy fields (trend, budget, monthly history, recurring split)
 * are left empty since they're meaningless for a mixed bucket.
 */
async function buildUnattributedDrilldown(
  categoryId: string,
  filters: SpendingAnalysisFilters,
  ancestryMap: Awaited<ReturnType<typeof buildCategoryAncestryMap>>,
): Promise<CategoryDrilldownResponse> {
  const currentRange = {
    start: parseStartDate(filters.start),
    end: parseEndDate(filters.end),
  };
  const txFilters = {
    startDate: currentRange.start,
    endDate: currentRange.end,
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    includeIgnored: filters.includeIgnored,
  };

  const [resolved, reportable, pace] = await Promise.all([
    getCategoryResolvedOutflows(txFilters, ancestryMap),
    getReportableOutflows(txFilters, ancestryMap),
    getPaceForFilters(filters),
  ]);

  const budgetContext = buildBudgetContext(filters, pace);
  const roleMap = budgetContext.month
    ? await getCategoryBudgetRoleMap(budgetContext.month, ancestryMap)
    : null;

  const { flexible, fixed } = splitUnattributedOutflows(
    reportable,
    new Set(resolved.map((tx) => tx.id)),
    roleMap,
  );
  const rows = categoryId === UNATTRIBUTED_FIXED_ID ? fixed : flexible;
  const name =
    categoryId === UNATTRIBUTED_FIXED_ID
      ? "Unattributed (fixed)"
      : "Unattributed (flexible)";
  const spend = roundCurrency(rows.reduce((sum, row) => sum + row.amount, 0));

  return {
    currentPeriod: getPeriodMeta(currentRange.start, currentRange.end),
    previousPeriod: null,
    budget: null,
    category: {
      categoryId,
      categoryName: name,
      spend,
      previousSpend: null,
      changeAmount: null,
      changePercent: null,
      transactionCount: rows.length,
      averageTransaction: rows.length > 0 ? roundCurrency(spend / rows.length) : 0,
    },
    series: [],
    topMerchants: [],
    transactions: [...rows]
      .sort((a, b) => b.amount - a.amount)
      .map((tx) => ({
        transactionId: tx.id,
        transactionDate: tx.transactionDateKey,
        merchantName: tx.normalizedMerchant || tx.merchantName,
        description: tx.description,
        amount: roundCurrency(tx.amount),
      })),
    monthlyHistory: [],
    recurringSplit: {
      recurringSpend: 0,
      recurringTransactionCount: 0,
      oneOffSpend: spend,
      oneOffTransactionCount: rows.length,
    },
    weekdayWeekendSplit: {
      weekdaySpend: 0,
      weekendSpend: 0,
      weekdayTransactionCount: 0,
      weekendTransactionCount: 0,
    },
  };
}

export async function getCategoryDrilldown(
  categoryId: string,
  filters: SpendingAnalysisFilters
): Promise<CategoryDrilldownResponse | null> {
  const ancestryMap = await buildCategoryAncestryMap();

  // Synthetic "unattributed" rows aren't real categories — resolve them to the
  // underlying reportable transactions so the drawer can list them.
  if (categoryId === UNATTRIBUTED_FLEXIBLE_ID || categoryId === UNATTRIBUTED_FIXED_ID) {
    return buildUnattributedDrilldown(categoryId, filters, ancestryMap);
  }

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
      getCategoryResolvedOutflows(
        { startDate: currentRange.start, endDate: currentRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
        ancestryMap,
      ),
      previousRange
        ? getCategoryResolvedOutflows(
            { startDate: previousRange.start, endDate: previousRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
            ancestryMap,
          )
        : Promise.resolve([]),
      getCategoryResolvedOutflows(
        { startDate: lookbackRange.start, endDate: lookbackRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
        ancestryMap,
      ),
      getCategoryResolvedOutflows(
        { startDate: historyStart, endDate: currentRange.end, accountId: filters.accountId, categoryId: filters.categoryId, includeIgnored: filters.includeIgnored },
        ancestryMap,
      ),
      getPaceForFilters(filters),
    ]);

  const filterCategoryTransactions = (transactions: CategoryResolvedOutflow[]) =>
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
    transactions: [...currentCategoryTransactions]
      .sort((a, b) => b.amount - a.amount)
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
