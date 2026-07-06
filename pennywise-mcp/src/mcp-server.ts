import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getActiveMonth, getMonthlyExport } from "./pennywise-client.js";
import { spendingExportShape } from "./export-schema.js";
import { jsonResult, errorResult, describeError } from "./tool-helpers.js";
import { registerSpendingTools } from "./tools-spending.js";
import { registerBudgetTools } from "./tools-budget.js";
import { registerBudgetPaceWidget } from "./widgets/budget-pace.js";

const MONTH_RE = /^\d{4}-\d{2}$/;

const SERVER_INSTRUCTIONS = [
  "These tools read and (with the user's confirmation) update the user's personal",
  "Pennywise finances. A 'month' is a pay cycle, not a calendar month — see the",
  "`cycle` object and the `guidance` array in summary responses, which explain how to",
  "read the numbers (e.g. which totals exclude ignored transactions, how categories",
  "roll up). Answer conversationally. All amounts are in GBP.",
  "",
  "For a snapshot of a whole month, use get_current_month_spending_summary /",
  "get_spending_summary_for_month. For analysing spending over cycles, weeks, or",
  "arbitrary date ranges (and comparing periods), use get_spending_analysis, then",
  "get_category_drilldown to dig into one category.",
  "",
  "The set_*/update_*/add_* tools MODIFY live budget data — confirm the specifics with",
  "the user before calling them, and report back exactly what changed.",
].join(" ");

/**
 * Build a fresh MCP server instance with all Pennywise tools registered.
 * A new instance is created per session by the HTTP layer.
 */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "pennywise-mcp", version: "0.2.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // --- Whole-month snapshots (rich export, read-only) ---
  server.registerTool(
    "get_current_month_spending_summary",
    {
      title: "Current month spending summary",
      description:
        "Get a complete snapshot of the user's spending for the CURRENT pay cycle " +
        "('this month'). Returns total spend so far, category breakdown, top " +
        "merchants, the full transaction ledger (with notes and which transactions " +
        "are ignored/excluded from reporting), budget context, and guidance on how " +
        "to interpret the figures. Use this for questions like 'tell me about my " +
        "spending this month', 'what have I spent most on', or 'any unusual " +
        "transactions this month'.",
      inputSchema: {},
      outputSchema: spendingExportShape,
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const month = await getActiveMonth();
        const data = await getMonthlyExport(month);
        return jsonResult(data);
      } catch (err) {
        return errorResult(
          describeError(
            err,
            "No budget is configured for the current cycle yet, so there's no " +
              "spending summary to show. Set up the current month's budget in the app first.",
          ),
        );
      }
    },
  );

  server.registerTool(
    "get_spending_summary_for_month",
    {
      title: "Spending summary for a specific month",
      description:
        "Get the same complete spending snapshot as get_current_month_spending_summary, " +
        "but for a specific budget month given as YYYY-MM (e.g. '2026-06' for last " +
        "month). Use this when the user asks about a month other than the current one.",
      inputSchema: {
        month: z
          .string()
          .regex(MONTH_RE, "month must be in YYYY-MM format, e.g. 2026-06")
          .describe("The budget month to summarise, formatted as YYYY-MM (e.g. 2026-06)."),
      },
      outputSchema: spendingExportShape,
      annotations: { readOnlyHint: true },
    },
    async ({ month }) => {
      try {
        const data = await getMonthlyExport(month);
        return jsonResult(data);
      } catch (err) {
        return errorResult(
          describeError(
            err,
            `No budget is configured for ${month}, so there's no spending summary ` +
              `for that month. Pick a month that has a budget set up in the app.`,
          ),
        );
      }
    },
  );

  // --- Inline chart widget (ChatGPT Apps SDK) for get_budget_pace ---
  registerBudgetPaceWidget(server);

  // --- Range/cycle/week analysis (read-only) ---
  registerSpendingTools(server);

  // --- Budget writes: core knobs, create/update only (no deletes) ---
  registerBudgetTools(server);

  return server;
}
