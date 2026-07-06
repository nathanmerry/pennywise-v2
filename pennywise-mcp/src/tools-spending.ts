import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getActiveMonth,
  getRecentCycles,
  getSpendingAnalysis,
  getCategoryDrilldown,
  getBudgetPace,
} from "./pennywise-client.js";
import { resolveRange, RANGE_PRESETS, type RangePreset } from "./range.js";
import { analysisOutputShape, drilldownOutputShape, paceOutputShape } from "./analysis-schema.js";
import { textAndStructured, errorResult, describeError } from "./tool-helpers.js";

/** Shape of the fields we read from GET /api/budget/pace/:month. */
interface PaceResponse {
  elapsedDays: number;
  totalDaysInMonth: number;
  elapsedRatio: number;
  overall: {
    flexibleBudget: number;
    actualFlexibleSpendToDate: number;
    expectedFlexibleSpendByNow: number;
    remainingFlexibleBudget: number;
    status: string;
  };
  categories: Array<{
    categoryName: string;
    monthlyBudget: number | null;
    actualSpendToDate: number;
    status: string;
  }>;
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

const rangeEnum = z.enum(RANGE_PRESETS);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared range inputs for the analysis tools. */
const rangeInputSchema = {
  range: rangeEnum.describe(
    "Which period to analyse: 'this_cycle', 'last_cycle', 'last_3_cycles', 'last_6_cycles', 'ytd' (year to date), or 'custom' (requires start & end).",
  ),
  start: z
    .string()
    .regex(DATE_RE)
    .optional()
    .describe("Custom range start (YYYY-MM-DD). Required only when range='custom'."),
  end: z
    .string()
    .regex(DATE_RE)
    .optional()
    .describe("Custom range end (YYYY-MM-DD). Required only when range='custom'."),
  week: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Optional 1-based week within the cycle. Only valid for range='this_cycle' or 'last_cycle'."),
  includeIgnored: z
    .boolean()
    .optional()
    .describe("Include transactions marked ignored/excluded from reporting. Default false."),
} as const;

/** Fetch cycles only for the presets that need them; keeps custom/ytd working even with no cycles. */
async function cyclesFor(preset: RangePreset) {
  const needsCycles =
    preset === "this_cycle" ||
    preset === "last_cycle" ||
    preset === "last_3_cycles" ||
    preset === "last_6_cycles";
  return needsCycles ? getRecentCycles(12) : [];
}

function shortSummary(range: string, start: string, end: string, analysis: unknown): string {
  const a = analysis as {
    summary?: { totalSpend?: number; transactionCount?: number; highestCategory?: { categoryName?: string; spend?: number } | null };
  };
  const total = a.summary?.totalSpend ?? 0;
  const count = a.summary?.transactionCount ?? 0;
  const top = a.summary?.highestCategory;
  const topStr = top ? `; biggest category ${top.categoryName} £${top.spend}` : "";
  return `Spending for ${range} (${start} → ${end}): £${total} across ${count} transactions${topStr}. Full breakdown attached.`;
}

export function registerSpendingTools(server: McpServer): void {
  server.registerTool(
    "get_spending_analysis",
    {
      title: "Spending analysis for a range",
      description:
        "Analyse spending over a period: category breakdown (with each category's " +
        "share, transaction count and trend), day-by-day spend series, and top " +
        "merchants. Supports pay-cycle presets (this/last cycle, last 3/6 cycles), " +
        "year-to-date, custom date ranges, and drilling into a single week of a " +
        "cycle. Use this for 'how much did I spend over the last 3 cycles', 'compare " +
        "this cycle to last', or 'week 2 of this cycle'. Read-only.",
      inputSchema: {
        ...rangeInputSchema,
        compare: z
          .boolean()
          .optional()
          .describe("Also return the previous equivalent period for comparison. Default false."),
      },
      outputSchema: analysisOutputShape,
      annotations: { readOnlyHint: true },
    },
    async ({ range, start, end, week, includeIgnored, compare }) => {
      try {
        const cycles = await cyclesFor(range);
        const resolved = resolveRange({ preset: range, start, end, week }, cycles);
        const params: Record<string, string> = {
          start: resolved.start,
          end: resolved.end,
          preset: resolved.preset,
          compare: String(compare ?? false),
          includeIgnored: String(includeIgnored ?? false),
        };
        const analysis = await getSpendingAnalysis(params);
        const structured = {
          resolvedRange: { preset: range, start: resolved.start, end: resolved.end, ...(resolved.week ? { week: resolved.week } : {}) },
          ...(analysis as Record<string, unknown>),
        };
        return textAndStructured(shortSummary(range, resolved.start, resolved.end, analysis), structured);
      } catch (err) {
        return errorResult(describeError(err));
      }
    },
  );

  server.registerTool(
    "get_category_drilldown",
    {
      title: "Drill into one category for a range",
      description:
        "Detailed breakdown for a SINGLE category over a period: its transactions, " +
        "top merchants, day-by-day series, month-by-month history, recurring vs one-off " +
        "split, and weekday/weekend split. Pass the categoryId from get_spending_analysis " +
        "(categories[].categoryId). Same range options as get_spending_analysis. Read-only.",
      inputSchema: {
        categoryId: z.string().describe("The category id, from get_spending_analysis categories[].categoryId."),
        ...rangeInputSchema,
      },
      outputSchema: drilldownOutputShape,
      annotations: { readOnlyHint: true },
    },
    async ({ categoryId, range, start, end, week, includeIgnored }) => {
      try {
        const cycles = await cyclesFor(range);
        const resolved = resolveRange({ preset: range, start, end, week }, cycles);
        const params: Record<string, string> = {
          start: resolved.start,
          end: resolved.end,
          preset: resolved.preset,
          includeIgnored: String(includeIgnored ?? false),
        };
        const detail = await getCategoryDrilldown(categoryId, params);
        return textAndStructured(
          `Category drilldown (${range} ${resolved.start} → ${resolved.end}). Full detail attached.`,
          detail,
        );
      } catch (err) {
        return errorResult(
          describeError(err, `No category found for id "${categoryId}" in that range.`),
        );
      }
    },
  );

  server.registerTool(
    "get_budget_pace",
    {
      title: "Budget pace — spend % vs cycle-elapsed %",
      description:
        "Chart-ready budget pace for a month: how much of the flexible budget has been " +
        "spent (spentPct) versus how far through the pay cycle you are (elapsedPct) — e.g. " +
        "£200 of a £400 budget → spentPct 50. Also returns per-category budget/spent/percent " +
        "and an overall on-track status. Use this for 'am I on track this month', 'chart my " +
        "budget spent vs how far through the month I am', or 'which categories are ahead of " +
        "pace'. Read-only.",
      inputSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional()
          .describe("Budget month YYYY-MM. Defaults to the current cycle if omitted."),
      },
      outputSchema: paceOutputShape,
      annotations: { readOnlyHint: true },
    },
    async ({ month }) => {
      let m = month;
      try {
        if (!m) m = await getActiveMonth();
        const pace = (await getBudgetPace(m)) as PaceResponse;
        const o = pace.overall;
        const compact = {
          month: m,
          daysElapsed: pace.elapsedDays,
          daysInCycle: pace.totalDaysInMonth,
          elapsedPct: Math.round(pace.elapsedRatio * 100),
          overall: {
            flexibleBudget: o.flexibleBudget,
            spent: o.actualFlexibleSpendToDate,
            spentPct: pct(o.actualFlexibleSpendToDate, o.flexibleBudget),
            expectedByNow: o.expectedFlexibleSpendByNow,
            expectedPct: pct(o.expectedFlexibleSpendByNow, o.flexibleBudget),
            remaining: o.remainingFlexibleBudget,
            status: o.status,
          },
          categories: pace.categories.map((c) => ({
            name: c.categoryName,
            budget: c.monthlyBudget,
            spent: c.actualSpendToDate,
            spentPct: c.monthlyBudget ? pct(c.actualSpendToDate, c.monthlyBudget) : null,
            status: c.status,
          })),
        };
        const text =
          `${compact.elapsedPct}% through the cycle; spent ${compact.overall.spentPct ?? "—"}% of the ` +
          `flexible budget (£${compact.overall.spent} of £${compact.overall.flexibleBudget}). ` +
          `Status: ${compact.overall.status}.`;
        return textAndStructured(text, compact);
      } catch (err) {
        return errorResult(
          describeError(
            err,
            `No budget is configured for ${m ?? "the current cycle"}, so there's no pace to ` +
              `show. Set up the month's budget in the app first.`,
          ),
        );
      }
    },
  );
}
