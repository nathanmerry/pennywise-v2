import { z } from "zod";

/**
 * Tolerant output schema for get_spending_analysis. Mirrors the backend's
 * SpendingAnalysisResponse (services/spending-analysis.ts) but uses passthrough
 * objects so it validates cleanly while forwarding the full payload — same
 * rationale as export-schema.ts.
 */

const passthrough = z.object({}).passthrough();

const categoryRow = z
  .object({
    categoryId: z.string(),
    categoryName: z.string(),
    kind: z.string(),
    spend: z.number(),
    shareOfTotal: z.number(),
    transactionCount: z.number(),
  })
  .passthrough();

const merchantRow = z
  .object({
    merchant: z.string(),
    spend: z.number(),
    transactionCount: z.number(),
  })
  .passthrough();

export const analysisOutputShape = {
  /** Echo of what the requested range resolved to. */
  resolvedRange: z
    .object({
      preset: z.string(),
      start: z.string(),
      end: z.string(),
      week: z.number().optional(),
    })
    .passthrough(),
  currentPeriod: z.object({ start: z.string(), end: z.string(), dayCount: z.number() }).passthrough(),
  previousPeriod: passthrough.nullable(),
  budgetContext: passthrough,
  summary: z
    .object({
      totalSpend: z.number(),
      previousTotalSpend: z.number().nullable(),
      avgPerDay: z.number(),
      transactionCount: z.number(),
      recurringSpend: z.number(),
      flexibleSpend: z.number(),
      fixedSpend: z.number(),
      highestCategory: z
        .object({ categoryId: z.string(), categoryName: z.string(), spend: z.number() })
        .passthrough()
        .nullable(),
    })
    .passthrough(),
  series: z.array(passthrough),
  categories: z.array(categoryRow),
  topMerchants: z.array(merchantRow),
} as const;

/** Loose schema for the per-category drilldown (get_category_drilldown). */
export const drilldownOutputShape = {
  category: passthrough,
  currentPeriod: passthrough,
  topMerchants: z.array(passthrough),
  transactions: z.array(passthrough),
} as const;
