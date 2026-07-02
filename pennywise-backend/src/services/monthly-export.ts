/**
 * Monthly export.
 *
 * Assembles a single structured snapshot of a budget month — the plan, the
 * actuals, and the raw transactions — intended to be handed to an LLM (ChatGPT,
 * Claude, etc.) as context for a conversation about the user's finances.
 *
 * IMPORTANT: this module does NO financial calculation of its own. Every number
 * comes from the same services that power the Budget and Spending pages
 * (getBudgetOverview, getSpendingBreakdown, getEventsForMonth, effectiveAmount),
 * so the export can never drift from what the user sees in the UI.
 */

import { prisma } from "../lib/prisma.js";
import { effectiveAmount } from "../lib/effective-amount.js";
import { getPayCycleFromBudgetMonth } from "./cycle.js";
import {
  getBudgetOverview,
  getSpendingBreakdown,
  getEventsForMonth,
} from "./budget.js";

/** Bump when the shape changes so downstream consumers can detect it. */
const SCHEMA_VERSION = 1;

export interface MonthlyExport {
  schemaVersion: number;
  generatedAt: string;
  currency: string;
  month: string;
  /** Plain-English rules for correctly interpreting the numbers below. */
  guidance: string[];
  cycle: {
    label: string;
    startDate: string;
    endDate: string;
    daysInCycle: number;
    daysElapsed: number;
    daysRemaining: number;
    status: "current" | "past" | "future";
  };
  summary: {
    expectedIncome: number;
    savingsTarget: number;
    fixedCommitmentsTotal: number;
    plannedOneOffsTotal: number;
    eventsReservedTotal: number;
    flexibleBudget: number;
    unallocated: number;
    actualSpend: number;
    remainingFlexible: number;
    moneyIn: number;
    moneyOut: number;
    netAfterIgnored: number;
  };
  budget: {
    fixedCommitments: Array<{
      name: string;
      amount: number;
      category: string | null;
      dueDate: string | null;
    }>;
    plannedOneOffs: Array<{
      name: string;
      amount: number;
      category: string | null;
      budgetGroup: string | null;
      plannedDate: string | null;
      isEssential: boolean;
    }>;
    categoryBudgets: Array<{
      name: string;
      scope: "category" | "group";
      targetType: "fixed" | "percent";
      /** The raw target: a currency amount for `fixed`, a percentage for `percent`. */
      target: number;
      /** The resolved currency amount (percent plans resolved against flexible budget). */
      resolvedAmount: number;
      spent: number;
      remaining: number;
    }>;
    budgetGroups: Array<{
      name: string;
      budget: number | null;
      spent: number;
      remaining: number | null;
      categories: string[];
    }>;
    events: Array<{
      name: string;
      startDate: string;
      endDate: string;
      cap: number;
      fundingSource: string;
      actualSpend: number;
      notes: string | null;
      pots: Array<{
        name: string;
        amount: number;
        category: string | null;
        actualSpend: number | null;
      }>;
    }>;
  };
  spending: {
    byCategory: Array<{
      category: string;
      spent: number;
      budget: number | null;
      remaining: number | null;
      percentUsed: number | null;
    }>;
    topMerchants: Array<{ merchant: string; spent: number; transactionCount: number }>;
  };
  transactions: Array<{
    date: string;
    description: string;
    merchant: string | null;
    amount: number;
    categories: string[];
    note: string | null;
    /** True when excluded from reporting and budgeting (Transaction.isIgnored). */
    ignored: boolean;
  }>;
}

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

/** Round to 2dp to strip floating-point noise before serialising for an LLM. */
function money(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/** Calendar day (YYYY-MM-DD) using local components — avoids UTC off-by-one. */
function localDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "July 2026 cycle" — named after the calendar month covering most of the cycle. */
function cycleLabel(start: Date, endExclusive: Date): string {
  const mid = new Date((start.getTime() + endExclusive.getTime()) / 2);
  const monthYear = mid.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return `${monthYear} cycle`;
}

/**
 * Build the full monthly export for a budget month (YYYY-MM). Returns null when
 * no BudgetMonth exists for that key — the caller should surface a 404 so the UI
 * can prompt the user to set up the cycle first.
 */
export async function buildMonthlyExport(month: string): Promise<MonthlyExport | null> {
  // getBudgetOverview is the source of truth for the headline totals and cycle
  // window. If it returns null the month hasn't been set up.
  const overview = await getBudgetOverview(month);
  if (!overview) return null;

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: {
      fixedCommitments: { include: { category: true } },
      plannedSpends: { include: { budgetGroup: true, category: true } },
      categoryPlans: { include: { budgetGroup: true, category: true } },
    },
  });
  if (!budgetMonth) return null;

  const now = new Date();
  const cycle = getPayCycleFromBudgetMonth(
    {
      month: budgetMonth.month,
      cycleStartDate: new Date(budgetMonth.cycleStartDate),
      cycleEndDate: new Date(budgetMonth.cycleEndDate),
    },
    now,
  );

  // Reuse the same breakdown + events services the Budget/Spending pages use.
  const [breakdown, events] = await Promise.all([
    getSpendingBreakdown(month),
    getEventsForMonth(month),
  ]);

  // Raw transaction ledger for the cycle. This is a plain listing (not a
  // calculation) — includes ignored rows so they can be flagged, and uses
  // effectiveAmount so the numbers match every other view.
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: cycle.startInclusive, lt: cycle.endExclusive },
    },
    orderBy: { transactionDate: "asc" },
    select: {
      transactionDate: true,
      description: true,
      merchantName: true,
      amount: true,
      updatedTransactionAmount: true,
      note: true,
      isIgnored: true,
      categories: {
        where: { source: { not: "inherited" } },
        // Stable ordering so a multi-category tx's primary category (categories[0])
        // is deterministic across exports rather than arbitrary DB order.
        orderBy: { category: { name: "asc" } },
        select: { category: { select: { name: true } } },
      },
    },
  });

  // ---- cycle status ----
  // Derive from the cycle window vs now (NOT from daysElapsed): on the cycle's
  // first day daysElapsed is 0, which would otherwise mislabel a live cycle as
  // "future".
  const status: "current" | "past" | "future" =
    now.getTime() < cycle.startInclusive.getTime()
      ? "future"
      : now.getTime() >= cycle.endExclusive.getTime()
        ? "past"
        : "current";

  // ---- spent lookups for merging plans with actuals ----
  const spentByCategoryId = new Map<string, number>();
  for (const row of breakdown.byParentCategory) spentByCategoryId.set(row.categoryId, row.spent);
  for (const row of breakdown.byChildCategory) spentByCategoryId.set(row.categoryId, row.spent);
  const spentByGroupId = new Map<string, number>();
  for (const row of breakdown.byBudgetGroup) spentByGroupId.set(row.groupId, row.spent);

  // ---- category budgets (plans) with resolved amount + actual spend ----
  // spentByCategoryId is keyed by root (byParentCategory) and exact leaf
  // (byChildCategory). A plan on a *mid-level* category won't roll up its
  // descendants' spend and can under-count. In practice the UI only creates
  // root-category and group plans (add-category-plan-dialog filters !parentId),
  // so this only bites plans made directly via the API.
  const categoryBudgets = budgetMonth.categoryPlans
    .map((plan) => {
      const target = num(plan.targetValue);
      const resolvedAmount =
        plan.targetType === "percent"
          ? overview.flexibleBudget * (target / 100)
          : target;
      const spent = plan.categoryId
        ? spentByCategoryId.get(plan.categoryId) ?? 0
        : plan.budgetGroupId
          ? spentByGroupId.get(plan.budgetGroupId) ?? 0
          : 0;
      return {
        name: plan.category?.name ?? plan.budgetGroup?.name ?? "Unknown",
        scope: (plan.categoryId ? "category" : "group") as "category" | "group",
        targetType: plan.targetType as "fixed" | "percent",
        target: money(target),
        resolvedAmount: money(resolvedAmount),
        spent: money(spent),
        remaining: money(resolvedAmount - spent),
      };
    })
    .sort((a, b) => b.spent - a.spent);

  // ---- budget groups (grouped budgeting): all groups, budget from plans, spend from breakdown ----
  const allGroups = await prisma.budgetGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categoryMappings: { include: { category: { select: { name: true } } } } },
  });
  const groupBudgetById = new Map<string, number>();
  for (const plan of budgetMonth.categoryPlans) {
    if (plan.budgetGroupId) groupBudgetById.set(plan.budgetGroupId, num(plan.targetValue));
  }
  const budgetGroups = allGroups
    .map((group) => {
      const budget = groupBudgetById.has(group.id) ? groupBudgetById.get(group.id)! : null;
      const spent = spentByGroupId.get(group.id) ?? 0;
      return {
        name: group.name,
        budget: budget === null ? null : money(budget),
        spent: money(spent),
        remaining: budget === null ? null : money(budget - spent),
        categories: group.categoryMappings.map((m) => m.category.name).sort(),
      };
    })
    // Only include groups that are actually in play this cycle (have a budget or spend).
    .filter((g) => g.budget !== null || g.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // ---- transactions ----
  const transactions = rawTransactions.map((tx) => ({
    date: localDateOnly(tx.transactionDate)!,
    description: tx.description,
    merchant: tx.merchantName,
    amount: money(effectiveAmount(tx)),
    categories: tx.categories.map((c) => c.category.name),
    note: tx.note,
    ignored: tx.isIgnored,
  }));

  const guidance = [
    "A 'month' in this export is a pay cycle (see cycle.label / cycle.startDate / cycle.endDate), not a calendar month.",
    "flexibleBudget is everyday discretionary money. It is ALREADY net of savingsTarget, fixedCommitments, plannedOneOffs and flexible-funded event reserves — these were subtracted at planning time, so do not subtract them again.",
    "eventsReservedTotal is money set aside for events/trips (flexible-funded events). It is a SEPARATE envelope and is NOT part of flexibleBudget or remainingFlexible. Total discretionary money for the cycle = flexibleBudget + eventsReservedTotal, with the reserve earmarked for the event; remainingFlexible is fully available for everyday spending.",
    "Events funded from 'savings' or 'external' (budget.events[].fundingSource) are not counted in eventsReservedTotal and come from money outside this cycle's flexible budget.",
    "actualSpend and every category/merchant 'spent' figure EXCLUDE ignored transactions. Ignored rows still appear in the transactions list, flagged, so summing the ledger will not match unless you drop ignored and income rows.",
    "spending.byCategory is rolled up to top-level categories: a category such as 'Eating Out' aggregates ALL of its subcategories (e.g. Coffee, Pub & Bar, Restaurant, Takeaway, Bakery). Each transaction in the transactions list carries its own, often more granular, subcategory, so a single top-level category total can span several subcategory names in the ledger.",
    "moneyIn and moneyOut cover ALL transactions including ignored; netAfterIgnored counts only non-ignored transactions, so if income (e.g. salary) is marked ignored, netAfterIgnored will look negative and is not a true cashflow figure — use moneyIn/moneyOut for cashflow.",
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    currency: "GBP",
    month,
    guidance,
    cycle: {
      label: cycleLabel(cycle.startInclusive, cycle.endExclusive),
      startDate: localDateOnly(cycle.cycleStartDate)!,
      endDate: localDateOnly(cycle.cycleEndDate)!,
      daysInCycle: cycle.daysInCycle,
      daysElapsed: cycle.daysElapsed,
      daysRemaining: cycle.daysRemaining,
      status,
    },
    summary: {
      expectedIncome: money(overview.expectedIncome),
      savingsTarget: money(overview.savingsTarget),
      fixedCommitmentsTotal: money(overview.fixedCommitments),
      plannedOneOffsTotal: money(overview.plannedOneOffs),
      eventsReservedTotal: money(overview.events),
      flexibleBudget: money(overview.flexibleBudget),
      unallocated: money(overview.unallocated),
      actualSpend: money(overview.actualSpend),
      remainingFlexible: money(overview.remainingFlexible),
      moneyIn: money(overview.moneyIn),
      moneyOut: money(overview.moneyOut),
      netAfterIgnored: money(overview.netAfterIgnored),
    },
    budget: {
      fixedCommitments: budgetMonth.fixedCommitments
        .map((c) => ({
          name: c.name,
          amount: money(num(c.amount)),
          category: c.category?.name ?? null,
          dueDate: localDateOnly(c.dueDate),
        }))
        .sort((a, b) => b.amount - a.amount),
      plannedOneOffs: budgetMonth.plannedSpends
        .map((s) => ({
          name: s.name,
          amount: money(num(s.amount)),
          category: s.category?.name ?? null,
          budgetGroup: s.budgetGroup?.name ?? null,
          plannedDate: localDateOnly(s.plannedDate),
          isEssential: s.isEssential,
        }))
        .sort((a, b) => b.amount - a.amount),
      categoryBudgets,
      budgetGroups,
      events: events.map((e) => ({
        name: e.name,
        startDate: localDateOnly(e.startDate)!,
        endDate: localDateOnly(e.endDate)!,
        cap: money(e.cap),
        fundingSource: e.fundingSource,
        actualSpend: money(e.actualSpend),
        notes: e.notes,
        pots: e.pots.map((p) => ({
          name: p.name,
          amount: money(p.amount),
          category: p.category?.name ?? null,
          actualSpend: p.actualSpend === null ? null : money(p.actualSpend),
        })),
      })),
    },
    spending: {
      byCategory: breakdown.byParentCategory.map((c) => ({
        category: c.categoryName,
        spent: money(c.spent),
        budget: c.budget === null ? null : money(c.budget),
        remaining: c.remaining === null ? null : money(c.remaining),
        percentUsed: c.percentUsed === null ? null : Math.round(c.percentUsed),
      })),
      topMerchants: breakdown.topMerchants.slice(0, 15).map((m) => ({
        merchant: m.merchant,
        spent: money(m.spent),
        transactionCount: m.count,
      })),
    },
    transactions,
  };
}
