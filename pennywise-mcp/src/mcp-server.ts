import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getActiveMonth,
  getMonthlyExport,
  PennywiseApiError,
} from "./pennywise-client.js";
import { spendingExportShape } from "./export-schema.js";

const MONTH_RE = /^\d{4}-\d{2}$/;

const SERVER_INSTRUCTIONS = [
  "These tools return the user's personal spending data from their Pennywise app.",
  "A 'month' is a pay cycle, not a calendar month — see the `cycle` object and the",
  "`guidance` array in every response, which explain exactly how to read the numbers",
  "(e.g. which totals exclude ignored transactions, how categories roll up).",
  "Answer conversationally: lead with the headline (total spent so far, biggest",
  "category), then notable transactions, unusual items, and anything excluded from",
  "reporting. All amounts are in GBP unless the `currency` field says otherwise.",
].join(" ");

/**
 * Wrap a spending export as an MCP tool result.
 *
 * Returns the data in BOTH channels for maximum client compatibility:
 *   - `structuredContent`: the canonical structured payload (validated against
 *     the tool's outputSchema; what the ChatGPT Apps runtime reasons over).
 *   - `content` text: the same JSON, so clients that only read text content
 *     still get the full data.
 */
function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** Wrap a human-readable error as a tool result (isError=true, not a thrown exception). */
function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Turn a thrown error into a friendly, model-usable message. */
function describeError(err: unknown, notFoundHint: string): string {
  if (err instanceof PennywiseApiError) {
    if (err.status === 404) return notFoundHint;
    return `Couldn't load spending data: ${err.message}`;
  }
  const reason = err instanceof Error ? err.message : String(err);
  return `Unexpected error loading spending data: ${reason}`;
}

/**
 * Build a fresh MCP server instance with the Pennywise spending tools registered.
 * A new instance is created per session by the HTTP layer.
 */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "pennywise-mcp", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

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

  return server;
}
