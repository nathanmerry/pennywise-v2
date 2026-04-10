import type { MonthlyBudgetPace, OverallPaceStatus } from "@/lib/api";

export type MonthlyStatusState = OverallPaceStatus;
export type MonthlyStatusTone = "neutral" | "warning" | "destructive";

export interface MonthlyStatusResult {
  state: MonthlyStatusState;
  headline: string;
  primaryStat: string;
  secondaryFacts: string[];
  tone: MonthlyStatusTone;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getMonthlyStatusFromPace(pace: MonthlyBudgetPace): MonthlyStatusResult {
  const { overall, highlights, remainingDays } = pace;
  const state = overall.status;

  // Determine headline based on state - one short sentence
  const headlines: Record<MonthlyStatusState, string> = {
    on_track: "You are on track this month",
    over_pace: "You are spending ahead of pace",
    over_budget: "Some categories are over budget",
    overspent: "You are overspent this month",
  };

  // Determine tone
  const tones: Record<MonthlyStatusState, MonthlyStatusTone> = {
    on_track: "neutral",
    over_pace: "warning",
    over_budget: "warning",
    overspent: "destructive",
  };

  // Primary stat: exactly one bold supporting fact
  // Priority: overspent > over pace > remaining
  let primaryStat: string;
  if (overall.remainingFlexibleBudget < 0) {
    primaryStat = `${formatCurrency(Math.abs(overall.remainingFlexibleBudget))} over flexible budget`;
  } else if (overall.paceDelta > 0) {
    primaryStat = `${formatCurrency(overall.paceDelta)} over expected spend by now`;
  } else {
    primaryStat = `${formatCurrency(overall.remainingFlexibleBudget)} left from flexible budget`;
  }

  // Secondary facts: max 2, prioritized
  const secondaryFacts: string[] = [];

  // Priority 1: Safe daily spend
  if (overall.safeDailySpend > 0 && remainingDays > 0) {
    secondaryFacts.push(`Safe to spend ${formatCurrencyPrecise(overall.safeDailySpend)}/day from here`);
  }

  // Priority 2: Main category issue
  if (highlights.topOverBudgetCategories.length > 0) {
    const worst = highlights.topOverBudgetCategories[0];
    secondaryFacts.push(`Main issue: ${worst.categoryName} is ${formatCurrency(worst.overAmount)} over budget`);
  } else if (highlights.topOverPaceCategories.length > 0 && state !== "on_track") {
    const worst = highlights.topOverPaceCategories[0];
    secondaryFacts.push(`Main pressure: ${worst.categoryName}`);
  }

  // Priority 3: Days left (only if we have room)
  if (secondaryFacts.length < 2 && remainingDays > 0) {
    secondaryFacts.push(`${remainingDays} days left in month`);
  }

  return {
    state,
    headline: headlines[state],
    primaryStat,
    secondaryFacts: secondaryFacts.slice(0, 2),
    tone: tones[state],
  };
}

// Legacy function for backwards compatibility (Layer 1 fallback)
export interface LegacyStatusInput {
  remainingFlexibleBudget: number;
  flexibleBudget: number;
  safeDailySpend: number;
  overBudgetCategories: Array<{
    categoryId: string;
    categoryName: string;
    spent: number;
    budget: number;
    overAmount: number;
  }>;
  daysUntilPayday?: number;
}

export function getMonthlyStatus(input: LegacyStatusInput): MonthlyStatusResult {
  const {
    remainingFlexibleBudget,
    safeDailySpend,
    overBudgetCategories,
    daysUntilPayday,
  } = input;

  // Determine state (simplified without pace)
  let state: MonthlyStatusState;
  if (remainingFlexibleBudget < -50) {
    state = "overspent";
  } else if (remainingFlexibleBudget <= 0) {
    state = "over_budget";
  } else if (overBudgetCategories.length > 0) {
    state = "over_pace";
  } else {
    state = "on_track";
  }

  const headlines: Record<MonthlyStatusState, string> = {
    on_track: "You are on track this month",
    over_pace: "Some categories are over budget",
    over_budget: "You have no flexible budget left",
    overspent: "You are overspent this month",
  };

  const tones: Record<MonthlyStatusState, MonthlyStatusTone> = {
    on_track: "neutral",
    over_pace: "warning",
    over_budget: "warning",
    overspent: "destructive",
  };

  // Primary stat
  let primaryStat: string;
  if (remainingFlexibleBudget < 0) {
    primaryStat = `${formatCurrency(Math.abs(remainingFlexibleBudget))} over flexible budget`;
  } else {
    primaryStat = `${formatCurrency(remainingFlexibleBudget)} left from flexible budget`;
  }

  // Secondary facts (max 2)
  const secondaryFacts: string[] = [];

  if (safeDailySpend > 0) {
    secondaryFacts.push(`Safe to spend ${formatCurrencyPrecise(safeDailySpend)}/day`);
  }

  if (overBudgetCategories.length > 0) {
    const sorted = [...overBudgetCategories].sort((a, b) => b.overAmount - a.overAmount);
    const worst = sorted[0];
    secondaryFacts.push(`Main issue: ${worst.categoryName} is ${formatCurrency(worst.overAmount)} over`);
  }

  if (secondaryFacts.length < 2 && daysUntilPayday !== undefined) {
    secondaryFacts.push(`${daysUntilPayday} days until payday`);
  }

  return {
    state,
    headline: headlines[state],
    primaryStat,
    secondaryFacts: secondaryFacts.slice(0, 2),
    tone: tones[state],
  };
}
