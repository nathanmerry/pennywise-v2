const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// Connections
export function fetchConnections() {
  return request<Connection[]>("/connections");
}

export function getAuthUrl() {
  return request<{ url: string }>("/connections/auth-url");
}

export function deleteConnection(id: string) {
  return request<{ ok: boolean }>(`/connections/${id}`, { method: "DELETE" });
}

export function getReauthUrl(id: string) {
  return request<{ url: string }>(`/connections/${id}/reauth`);
}

// Accounts
export function fetchAccounts() {
  return request<Account[]>("/accounts");
}

// Transactions
export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  isIgnored?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function fetchTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== "") params.set(key, String(val));
  });
  return request<PaginatedResponse<Transaction>>(`/transactions?${params}`);
}

export function updateTransaction(
  id: string,
  data: { note?: string | null; categoryIds?: string[] | null; isIgnored?: boolean }
) {
  return request<Transaction>(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function bulkUpdateTransactions(
  ids: string[],
  data: { note?: string | null; categoryIds?: string[] | null; isIgnored?: boolean }
) {
  return request<{ updated: number }>("/transactions/bulk", {
    method: "PATCH",
    body: JSON.stringify({ ids, ...data }),
  });
}

// Categories
export function fetchCategories() {
  return request<Category[]>("/categories");
}

export function createCategory(data: { name: string; color?: string | null; parentId?: string | null }) {
  return request<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: string, data: { name?: string; color?: string | null; parentId?: string | null }) {
  return request<Category>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: string) {
  return request<{ ok: boolean }>(`/categories/${id}`, { method: "DELETE" });
}

// Rules
export function fetchRules() {
  return request<RecurringRule[]>("/rules");
}

export function createRule(data: {
  matchType: "merchant" | "description";
  matchValue: string;
  categoryIds?: string[];
  setIgnored?: boolean | null;
  applyToExisting?: boolean;
}) {
  return request<{ rule: RecurringRule; applied: number }>("/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRule(
  id: string,
  data: Partial<{
    matchType: "merchant" | "description";
    matchValue: string;
    categoryIds: string[] | null;
    setIgnored: boolean | null;
    active: boolean;
  }>
) {
  return request<RecurringRule>(`/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteRule(id: string) {
  return request<{ ok: boolean }>(`/rules/${id}`, { method: "DELETE" });
}

export function applyRule(id: string) {
  return request<{ applied: number }>(`/rules/${id}/apply`, { method: "POST" });
}

// Sync
export function syncAll() {
  return request<{ results: SyncResult[] }>("/sync", { method: "POST" });
}

export function syncConnection(connectionId: string) {
  return request<SyncResult>(`/sync/${connectionId}`, { method: "POST" });
}

// Types
export interface Connection {
  id: string;
  provider: string;
  institutionName: string;
  status: string;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  accounts: Account[];
}

export interface Account {
  id: string;
  providerAccountId: string;
  connectionId: string;
  accountName: string;
  accountType: string | null;
  accountSubType: string | null;
  currency: string;
  status: string;
  connection?: { id: string; institutionName: string; status: string };
}

export interface TransactionCategoryAssignment {
  id: string;
  transactionId: string;
  categoryId: string;
  source: "manual" | "rule" | "inherited";
  sourceRuleId: string | null;
  category: Category;
}

export interface Transaction {
  id: string;
  source: string;
  sourceTransactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  transactionDate: string;
  description: string;
  merchantName: string | null;
  pending: boolean;
  note: string | null;
  isIgnored: boolean;
  ignoreSource: string | null;
  categoriesLockedByUser: boolean;
  createdAt: string;
  updatedAt: string;
  categories: TransactionCategoryAssignment[];
  account: Account & {
    connection: { institutionName: string };
  };
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  createdAt: string;
  parent?: Category | null;
  children?: Category[];
  _count?: { transactionCategories: number };
}

export interface RuleCategoryAssignment {
  id: string;
  ruleId: string;
  categoryId: string;
  category: Category;
}

export interface RecurringRule {
  id: string;
  matchType: "merchant" | "description";
  matchValue: string;
  setIgnored: boolean | null;
  active: boolean;
  createdAt: string;
  categories: RuleCategoryAssignment[];
}

export interface SyncResult {
  synced: number;
  connectionId: string;
  status: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// BUDGET TYPES
// ============================================================================

export interface BudgetGroup {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  categoryMappings: { id: string; categoryId: string; category: Category }[];
}

export interface BudgetMonth {
  id: string;
  month: string;
  expectedIncome: string;
  paydayDate: string;
  savingsTargetType: "fixed" | "percent";
  savingsTargetValue: string;
  notes: string | null;
  fixedCommitments: BudgetFixedCommitment[];
  plannedSpends: BudgetPlannedSpend[];
  categoryPlans: BudgetCategoryPlan[];
}

export interface BudgetFixedCommitment {
  id: string;
  budgetMonthId: string;
  name: string;
  amount: string;
  dueDate: string | null;
  categoryId: string | null;
  category: Category | null;
}

export interface BudgetPlannedSpend {
  id: string;
  budgetMonthId: string;
  name: string;
  amount: string;
  plannedDate: string | null;
  budgetGroupId: string | null;
  categoryId: string | null;
  isEssential: boolean;
  budgetGroup: BudgetGroup | null;
  category: Category | null;
}

export interface BudgetCategoryPlan {
  id: string;
  budgetMonthId: string;
  budgetGroupId: string | null;
  categoryId: string | null;
  targetType: "fixed" | "percent";
  targetValue: string;
  budgetGroup: BudgetGroup | null;
  category: Category | null;
}

export interface BudgetOverview {
  month: string;
  expectedIncome: number;
  paydayDate: string;
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

export type AnalysisPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_4_months"
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

export interface AnalysisPeriod {
  start: string;
  end: string;
  dayCount: number;
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

export function fetchSpendingAnalysis(filters: SpendingAnalysisFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return request<SpendingAnalysisResponse>(`/budget/analysis?${params.toString()}`);
}

export function fetchCategoryDrilldown(categoryId: string, filters: SpendingAnalysisFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return request<CategoryDrilldownResponse>(`/budget/analysis/category/${categoryId}?${params.toString()}`);
}

// ============================================================================
// BUDGET API
// ============================================================================

// Budget Groups
export function fetchBudgetGroups() {
  return request<BudgetGroup[]>("/budget/groups");
}

export function createBudgetGroup(data: { name: string; color?: string | null; sortOrder?: number; categoryIds?: string[] }) {
  return request<BudgetGroup>("/budget/groups", { method: "POST", body: JSON.stringify(data) });
}

export function updateBudgetGroup(id: string, data: { name?: string; color?: string | null; sortOrder?: number; categoryIds?: string[] }) {
  return request<BudgetGroup>(`/budget/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteBudgetGroup(id: string) {
  return request<{ ok: boolean }>(`/budget/groups/${id}`, { method: "DELETE" });
}

// Budget Months
export function fetchBudgetMonths() {
  return request<BudgetMonth[]>("/budget/months");
}

export function fetchBudgetMonth(month: string) {
  return request<BudgetMonth>(`/budget/months/${month}`);
}

export function createBudgetMonth(data: {
  month: string;
  expectedIncome: number;
  paydayDate: string;
  savingsTargetType?: "fixed" | "percent";
  savingsTargetValue: number;
  notes?: string | null;
}) {
  return request<BudgetMonth>("/budget/months", { method: "POST", body: JSON.stringify(data) });
}

export function updateBudgetMonth(month: string, data: Partial<{
  expectedIncome: number;
  paydayDate: string;
  savingsTargetType: "fixed" | "percent";
  savingsTargetValue: number;
  notes: string | null;
}>) {
  return request<BudgetMonth>(`/budget/months/${month}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteBudgetMonth(month: string) {
  return request<{ ok: boolean }>(`/budget/months/${month}`, { method: "DELETE" });
}

// Fixed Commitments
export function createFixedCommitment(month: string, data: { name: string; amount: number; dueDate?: string | null; categoryId?: string | null }) {
  return request<BudgetFixedCommitment>(`/budget/months/${month}/commitments`, { method: "POST", body: JSON.stringify(data) });
}

export function updateFixedCommitment(id: string, data: Partial<{ name: string; amount: number; dueDate: string | null; categoryId: string | null }>) {
  return request<BudgetFixedCommitment>(`/budget/commitments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteFixedCommitment(id: string) {
  return request<{ ok: boolean }>(`/budget/commitments/${id}`, { method: "DELETE" });
}

// Planned Spends
export function createPlannedSpend(month: string, data: {
  name: string;
  amount: number;
  plannedDate?: string | null;
  budgetGroupId?: string | null;
  categoryId?: string | null;
  isEssential?: boolean;
}) {
  return request<BudgetPlannedSpend>(`/budget/months/${month}/planned`, { method: "POST", body: JSON.stringify(data) });
}

export function updatePlannedSpend(id: string, data: Partial<{
  name: string;
  amount: number;
  plannedDate: string | null;
  budgetGroupId: string | null;
  categoryId: string | null;
  isEssential: boolean;
}>) {
  return request<BudgetPlannedSpend>(`/budget/planned/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deletePlannedSpend(id: string) {
  return request<{ ok: boolean }>(`/budget/planned/${id}`, { method: "DELETE" });
}

// Category Plans
export function createCategoryPlan(month: string, data: {
  budgetGroupId?: string | null;
  categoryId?: string | null;
  targetType?: "fixed" | "percent";
  targetValue: number;
}) {
  return request<BudgetCategoryPlan>(`/budget/months/${month}/plans`, { method: "POST", body: JSON.stringify(data) });
}

export function updateCategoryPlan(id: string, data: Partial<{
  budgetGroupId: string | null;
  categoryId: string | null;
  targetType: "fixed" | "percent";
  targetValue: number;
}>) {
  return request<BudgetCategoryPlan>(`/budget/plans/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteCategoryPlan(id: string) {
  return request<{ ok: boolean }>(`/budget/plans/${id}`, { method: "DELETE" });
}

// Dashboard Endpoints
export function fetchBudgetOverview(month: string) {
  return request<BudgetOverview>(`/budget/overview/${month}`);
}

// Monthly Pace (Layer 2)
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

export function fetchMonthlyPace(month: string) {
  return request<MonthlyBudgetPace>(`/budget/pace/${month}`);
}

// Category Pressure Detail (Layer 4)
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

export function fetchCategoryPressureDetail(month: string, categoryId: string) {
  return request<CategoryPressureDetail>(`/budget/category-pressure/${month}/${categoryId}`);
}

export function fetchCurrentBudgetOverview() {
  return request<BudgetOverview>("/budget/current");
}

export function fetchSpendingBreakdown(month: string) {
  return request<SpendingBreakdown>(`/budget/spending/${month}`);
}

export function fetchOverspendCategories(month: string) {
  return request<CategorySpend[]>(`/budget/overspend/${month}`);
}

// ============================================================================
// AI CATEGORISATION
// ============================================================================

export interface AiCategorisationResult {
  runId: string;
  transactionsConsidered: number;
  transactionsCategorised: number;
  categoriesCreated: number;
  transactionsSkipped: number;
  dryRun: boolean;
  errors: string[];
}

export interface AiCategorisationOptions {
  limit?: number;
  includeIgnored?: boolean;
  dryRun?: boolean;
  minConfidence?: number;
}

export function runAiCategorisation(options: AiCategorisationOptions = {}) {
  return request<AiCategorisationResult>("/admin/ai-categorisation/backfill", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function previewAiCategorisation(limit: number = 100) {
  return request<{
    transactionCount: number;
    transactions: Array<{
      id: string;
      description: string;
      merchantName: string | null;
      normalizedMerchant: string | null;
      amount: number;
      currency: string;
      transactionDate: string;
    }>;
    categoryCount: number;
  }>(`/admin/ai-categorisation/preview?limit=${limit}`);
}

// ============================================================================
// BUDGET RECOMMENDATIONS - Layer 5
// ============================================================================

export type VariabilityClass = 
  | "stable" 
  | "regular_lifestyle" 
  | "variable" 
  | "spiky" 
  | "low_signal";

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

export interface ApplySelection {
  categoryId: string;
  recommendedBudget: number;
  editedBudget?: number;
  apply: boolean;
}

export interface ApplyRecommendationsResult {
  applied: number;
  skipped: number;
}

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

export function fetchSpendingHistory(month: string) {
  return request<SpendingHistoryAnalysis>(`/budget/spending-history/${month}`);
}

export function fetchCategoryEvidence(month: string) {
  return request<Record<string, CategoryEvidence>>(`/budget/category-evidence/${month}`);
}

export function generateBudgetRecommendations(month: string) {
  return request<BudgetRecommendationResponse>(`/budget/recommendations/${month}`, {
    method: "POST",
  });
}

export function applyBudgetRecommendations(
  month: string,
  runId: string,
  selections: ApplySelection[]
) {
  return request<ApplyRecommendationsResult>(`/budget/recommendations/${month}/apply`, {
    method: "POST",
    body: JSON.stringify({ runId, selections }),
  });
}
