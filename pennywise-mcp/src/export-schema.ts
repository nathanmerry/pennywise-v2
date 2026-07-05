import { z } from "zod";

/**
 * Output schema for the spending-summary tools.
 *
 * This mirrors the backend's MonthlyExport shape (services/monthly-export.ts).
 * It is intentionally TOLERANT, not exhaustive:
 *   - Every object uses `.passthrough()` so unknown/added fields are preserved.
 *   - Deeply nested / variable structures (e.g. `budget`) are declared loosely.
 *
 * Why tolerant matters: the MCP SDK validates the returned `structuredContent`
 * against this schema but forwards the ORIGINAL object to the client (it discards
 * the parsed/stripped copy). A tolerant schema therefore (a) validates cleanly
 * even as the backend export grows, so it never spuriously breaks the tool, while
 * (b) still advertising the key fields to ChatGPT for structured reasoning. The
 * only hard requirement is that the fields we DO declare match the real types
 * (including nullability) — so those are pinned precisely.
 */

const categoryRow = z
  .object({
    category: z.string(),
    spent: z.number(),
    budget: z.number().nullable(),
    remaining: z.number().nullable(),
    percentUsed: z.number().nullable(),
  })
  .passthrough();

const merchantRow = z
  .object({
    merchant: z.string(),
    spent: z.number(),
    transactionCount: z.number(),
  })
  .passthrough();

const transactionRow = z
  .object({
    date: z.string(),
    description: z.string(),
    merchant: z.string().nullable(),
    amount: z.number(),
    categories: z.array(z.string()),
    note: z.string().nullable(),
    /** True when excluded from reporting/budgeting (Transaction.isIgnored). */
    ignored: z.boolean(),
  })
  .passthrough();

/** Raw shape passed to McpServer.registerTool({ outputSchema }). */
export const spendingExportShape = {
  schemaVersion: z.number(),
  generatedAt: z.string(),
  currency: z.string(),
  /** Budget month key, YYYY-MM. */
  month: z.string(),
  /** Plain-English rules for correctly interpreting the numbers. */
  guidance: z.array(z.string()),
  cycle: z
    .object({
      label: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      daysInCycle: z.number(),
      daysElapsed: z.number(),
      daysRemaining: z.number(),
      status: z.enum(["current", "past", "future"]),
    })
    .passthrough(),
  summary: z
    .object({
      expectedIncome: z.number(),
      savingsTarget: z.number(),
      fixedCommitmentsTotal: z.number(),
      plannedOneOffsTotal: z.number(),
      eventsReservedTotal: z.number(),
      flexibleBudget: z.number(),
      unallocated: z.number(),
      actualSpend: z.number(),
      remainingFlexible: z.number(),
      moneyIn: z.number(),
      moneyOut: z.number(),
      netAfterIgnored: z.number(),
    })
    .passthrough(),
  /** Complex/variable plan detail — declared loosely, preserved verbatim. */
  budget: z.object({}).passthrough(),
  spending: z
    .object({
      byCategory: z.array(categoryRow),
      topMerchants: z.array(merchantRow),
    })
    .passthrough(),
  transactions: z.array(transactionRow),
} as const;

/** Assembled Zod object — used in tests to validate fixtures/exports. */
export const spendingExportSchema = z.object(spendingExportShape);
