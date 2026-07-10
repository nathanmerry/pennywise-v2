import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listCategories,
  listAccounts,
  createTransaction,
  type CategoryRow,
} from "./pennywise-client.js";
import { textAndStructured, errorResult, describeError } from "./tool-helpers.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Prefer a top-level (root) category when several share a name. */
function findCategory(cats: CategoryRow[], name: string): CategoryRow | undefined {
  const wanted = name.trim().toLowerCase();
  const matches = cats.filter((c) => c.name.toLowerCase() === wanted);
  return matches.find((c) => c.parentId === null) ?? matches[0];
}

const txResultShape = {
  ok: z.boolean(),
  summary: z.string(),
  transaction: z.object({}).passthrough(),
} as const;

export function registerTransactionTools(server: McpServer): void {
  server.registerTool(
    "add_transaction",
    {
      title: "Add a manual transaction",
      description:
        "Manually record a transaction that isn't from a bank sync — e.g. cash spending or " +
        "a reimbursement. Enter the amount as a POSITIVE number and set direction ('expense' " +
        "by default, or 'income'). Optionally file it under a category, attach it to a specific " +
        "account (defaults to your primary account), set a date (defaults to today), add a " +
        "merchant or note, or mark it ignored/excluded from reporting. Writes to live data.",
      inputSchema: {
        description: z
          .string()
          .min(1)
          .describe("What it was for / the merchant, e.g. 'Tesco' or 'Lunch with Sam'."),
        amount: z.number().positive().describe("Amount as a positive number (£)."),
        direction: z
          .enum(["expense", "income"])
          .optional()
          .describe("'expense' (default) or 'income'."),
        date: z
          .string()
          .regex(DATE_RE)
          .optional()
          .describe("Transaction date YYYY-MM-DD. Defaults to today."),
        category: z.string().optional().describe("Optional category name to file it under."),
        account: z
          .string()
          .optional()
          .describe("Optional account name; defaults to your primary account."),
        merchant: z.string().optional().describe("Optional merchant name, if different from the description."),
        note: z.string().optional().describe("Optional note."),
        ignore: z
          .boolean()
          .optional()
          .describe("Exclude from reporting/budgeting. Default false."),
      },
      outputSchema: txResultShape,
      annotations: { readOnlyHint: false, title: "Add a manual transaction" },
    },
    async ({ description, amount, direction, date, category, account, merchant, note, ignore }) => {
      try {
        const body: Record<string, unknown> = {
          description,
          amount,
          direction: direction ?? "expense",
        };
        if (date) body.transactionDate = date;
        if (merchant) body.merchantName = merchant;
        if (note) body.note = note;
        if (ignore !== undefined) body.isIgnored = ignore;

        // Resolve an optional category name → id.
        if (category) {
          const cats = await listCategories();
          const cat = findCategory(cats, category);
          if (!cat) {
            const roots = cats.filter((c) => c.parentId === null).map((c) => c.name).sort();
            return errorResult(
              `No category called "${category}". Top-level categories: ${roots.join(", ") || "(none)"}.`,
            );
          }
          body.categoryIds = [cat.id];
        }

        // Resolve an optional account name → id (match name or institution).
        if (account) {
          const accounts = await listAccounts();
          const wanted = account.trim().toLowerCase();
          const acc = accounts.find(
            (a) =>
              a.accountName.toLowerCase() === wanted ||
              (a.connection?.institutionName ?? "").toLowerCase() === wanted,
          );
          if (!acc) {
            const names = accounts.map((a) => a.accountName).sort();
            return errorResult(
              `No account called "${account}". Available accounts: ${names.join(", ") || "(none)"}.`,
            );
          }
          body.accountId = acc.id;
        }

        const created = await createTransaction(body);
        const dir = direction ?? "expense";
        const summary = `Added ${dir} of £${amount} — "${description}"${category ? ` (${category})` : ""}${date ? ` on ${date}` : " today"}.`;
        return textAndStructured(summary, { ok: true, summary, transaction: created as Record<string, unknown> });
      } catch (err) {
        return errorResult(
          describeError(
            err,
            "Couldn't add the transaction — you may need a connected account first.",
          ),
        );
      }
    },
  );
}
