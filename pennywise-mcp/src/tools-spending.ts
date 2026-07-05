import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getRecentCycles,
  getSpendingAnalysis,
  getCategoryDrilldown,
} from "./pennywise-client.js";
import { resolveRange, RANGE_PRESETS, type RangePreset } from "./range.js";
import { analysisOutputShape, drilldownOutputShape } from "./analysis-schema.js";
import { textAndStructured, errorResult, describeError } from "./tool-helpers.js";

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
}
