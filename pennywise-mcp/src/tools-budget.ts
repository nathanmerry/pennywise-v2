import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getActiveMonth,
  getBudgetMonth,
  listCategories,
  listGroups,
  createCategoryPlan,
  updateCategoryPlan,
  patchBudgetMonth,
  createPlannedSpend,
  updatePlannedSpend,
  createCommitment,
  updateCommitment,
  type BudgetMonthFull,
  type CategoryRow,
} from "./pennywise-client.js";
import { assertMonthKey } from "./range.js";
import { textAndStructured, errorResult, describeError } from "./tool-helpers.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const monthArg = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()
  .describe("Budget month YYYY-MM. Defaults to the current active cycle if omitted.");

/** Shared output schema for all write tools. */
const writeResultShape = {
  ok: z.boolean(),
  action: z.enum(["created", "updated"]),
  kind: z.string(),
  name: z.string(),
  month: z.string(),
  summary: z.string(),
  result: z.object({}).passthrough(),
} as const;

async function resolveMonth(month: string | undefined): Promise<string> {
  if (month) {
    assertMonthKey(month);
    return month;
  }
  return getActiveMonth();
}

const noMonthHint = (m: string) =>
  `No budget is set up for ${m}. Create that month's budget in the app first, then try again.`;

function writeResult(
  action: "created" | "updated",
  kind: string,
  name: string,
  month: string,
  summary: string,
  result: unknown,
) {
  const verb = action === "created" ? "Created" : "Updated";
  return textAndStructured(`${verb} ${kind} "${name}" for ${month}: ${summary}.`, {
    ok: true,
    action,
    kind,
    name,
    month,
    summary,
    result: result as Record<string, unknown>,
  });
}

/** Prefer a top-level (root) category when several share a name. */
function findCategory(cats: CategoryRow[], name: string): CategoryRow | undefined {
  const wanted = name.trim().toLowerCase();
  const matches = cats.filter((c) => c.name.toLowerCase() === wanted);
  return matches.find((c) => c.parentId === null) ?? matches[0];
}

function toIsoDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** Find an existing named item (planned spend / commitment) for update-by-name. */
function findByName<T extends { id: string; name: string }>(items: T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return items.find((i) => i.name.toLowerCase() === wanted);
}

export function registerBudgetTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // Adjust a category/group budget (the core "adjust my budgets" tool)
  // -----------------------------------------------------------------------
  server.registerTool(
    "set_category_budget",
    {
      title: "Set or adjust a category/group budget",
      description:
        "Create or update the budget target for a spending category (e.g. 'Eating Out') " +
        "or a budget group, for a given month. If a budget already exists for it, it's " +
        "updated; otherwise a new one is created. Amount is a fixed £ figure by default, " +
        "or a percentage of the flexible budget when type='percent'. Writes to live data.",
      inputSchema: {
        category: z
          .string()
          .min(1)
          .describe("The category or budget group name to budget, e.g. 'Groceries'."),
        amount: z.number().min(0).describe("The budget amount: £ for type 'fixed', or a percentage for type 'percent'."),
        type: z.enum(["fixed", "percent"]).optional().describe("'fixed' (£, default) or 'percent' of flexible budget."),
        month: monthArg,
      },
      outputSchema: writeResultShape,
      annotations: { readOnlyHint: false, title: "Set or adjust a budget" },
    },
    async ({ category, amount, type, month }) => {
      try {
        const m = await resolveMonth(month);
        let budgetMonth: BudgetMonthFull;
        try {
          budgetMonth = await getBudgetMonth(m);
        } catch (err) {
          return errorResult(describeError(err, noMonthHint(m)));
        }

        const targetType = type ?? "fixed";
        const wanted = category.trim().toLowerCase();

        // 1. Update an existing plan if one matches by category or group name.
        const existing = budgetMonth.categoryPlans.find(
          (p) =>
            p.category?.name?.toLowerCase() === wanted ||
            p.budgetGroup?.name?.toLowerCase() === wanted,
        );
        const amountLabel = targetType === "percent" ? `${amount}%` : `£${amount}`;
        if (existing) {
          const result = await updateCategoryPlan(existing.id, { targetType, targetValue: amount });
          return writeResult("updated", existing.category ? "category budget" : "group budget", category, m, `budget set to ${amountLabel}`, result);
        }

        // 2. Otherwise create — resolve the name to a category (root-preferred) or group.
        const [cats, groups] = await Promise.all([listCategories(), listGroups()]);
        const cat = findCategory(cats, category);
        if (cat) {
          const result = await createCategoryPlan(m, { categoryId: cat.id, targetType, targetValue: amount });
          return writeResult("created", "category budget", cat.name, m, `budget set to ${amountLabel}`, result);
        }
        const group = groups.find((g) => g.name.toLowerCase() === wanted);
        if (group) {
          const result = await createCategoryPlan(m, { budgetGroupId: group.id, targetType, targetValue: amount });
          return writeResult("created", "group budget", group.name, m, `budget set to ${amountLabel}`, result);
        }

        // 3. Not found — help the model retry with a valid name.
        const rootNames = cats.filter((c) => c.parentId === null).map((c) => c.name).sort();
        const groupNames = groups.map((g) => g.name).sort();
        return errorResult(
          `Couldn't find a category or budget group called "${category}". ` +
            `Top-level categories: ${rootNames.join(", ") || "(none)"}. ` +
            `Budget groups: ${groupNames.join(", ") || "(none)"}.`,
        );
      } catch (err) {
        return errorResult(describeError(err));
      }
    },
  );

  // -----------------------------------------------------------------------
  // Update month-level knobs: income + savings target
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_budget_month",
    {
      title: "Update income / savings target",
      description:
        "Update the month-level budget settings: expected income and/or the savings " +
        "target (a fixed £ amount or a percentage of income). Changing these re-derives " +
        "your flexible budget. Provide at least one field. Writes to live data.",
      inputSchema: {
        month: monthArg,
        expectedIncome: z.number().positive().optional().describe("Expected income for the month (£)."),
        savingsTargetType: z.enum(["fixed", "percent"]).optional().describe("Savings target as 'fixed' (£) or 'percent' of income."),
        savingsTargetValue: z.number().min(0).optional().describe("Savings target amount: £ for 'fixed', percentage for 'percent'."),
      },
      outputSchema: writeResultShape,
      annotations: { readOnlyHint: false, title: "Update income / savings" },
    },
    async ({ month, expectedIncome, savingsTargetType, savingsTargetValue }) => {
      try {
        const m = await resolveMonth(month);
        const body: Record<string, unknown> = {};
        if (expectedIncome !== undefined) body.expectedIncome = expectedIncome;
        if (savingsTargetType !== undefined) body.savingsTargetType = savingsTargetType;
        if (savingsTargetValue !== undefined) body.savingsTargetValue = savingsTargetValue;
        if (Object.keys(body).length === 0) {
          return errorResult("Nothing to update — provide expectedIncome and/or a savings target.");
        }
        let result: unknown;
        try {
          result = await patchBudgetMonth(m, body);
        } catch (err) {
          return errorResult(describeError(err, noMonthHint(m)));
        }
        const parts = [
          expectedIncome !== undefined ? `income £${expectedIncome}` : null,
          savingsTargetValue !== undefined
            ? `savings ${savingsTargetType === "percent" ? `${savingsTargetValue}%` : `£${savingsTargetValue}`}`
            : null,
        ].filter(Boolean);
        return writeResult("updated", "month settings", m, m, parts.join(", "), result);
      } catch (err) {
        return errorResult(describeError(err));
      }
    },
  );

  // -----------------------------------------------------------------------
  // Planned one-offs
  // -----------------------------------------------------------------------
  server.registerTool(
    "add_planned_spend",
    {
      title: "Add or update a planned one-off",
      description:
        "Add a planned one-off spend (e.g. 'Concert tickets') to a month, or update the " +
        "existing one with the same name. Optionally tag it to a category or budget group, " +
        "give it a planned date, and mark it essential. Writes to live data.",
      inputSchema: {
        name: z.string().min(1).describe("Name of the planned spend, e.g. 'Flights'."),
        amount: z.number().positive().describe("Amount (£)."),
        month: monthArg,
        plannedDate: z.string().regex(DATE_RE).optional().describe("Optional planned date (YYYY-MM-DD)."),
        category: z.string().optional().describe("Optional category name to tag it to."),
        budgetGroup: z.string().optional().describe("Optional budget group name to tag it to."),
        isEssential: z.boolean().optional().describe("Mark as essential. Default false."),
      },
      outputSchema: writeResultShape,
      annotations: { readOnlyHint: false, title: "Add/update planned one-off" },
    },
    async ({ name, amount, month, plannedDate, category, budgetGroup, isEssential }) => {
      try {
        const m = await resolveMonth(month);
        let budgetMonth: BudgetMonthFull;
        try {
          budgetMonth = await getBudgetMonth(m);
        } catch (err) {
          return errorResult(describeError(err, noMonthHint(m)));
        }

        const body: Record<string, unknown> = { name, amount };
        if (plannedDate) body.plannedDate = toIsoDay(plannedDate);
        if (isEssential !== undefined) body.isEssential = isEssential;
        if (category) {
          const cats = await listCategories();
          const cat = findCategory(cats, category);
          if (!cat) return errorResult(`No category called "${category}".`);
          body.categoryId = cat.id;
        }
        if (budgetGroup) {
          const groups = await listGroups();
          const group = groups.find((g) => g.name.toLowerCase() === budgetGroup.trim().toLowerCase());
          if (!group) return errorResult(`No budget group called "${budgetGroup}".`);
          body.budgetGroupId = group.id;
        }

        const existing = findByName(budgetMonth.plannedSpends, name);
        const result = existing
          ? await updatePlannedSpend(existing.id, body)
          : await createPlannedSpend(m, body);
        return writeResult(existing ? "updated" : "created", "planned one-off", name, m, `£${amount}`, result);
      } catch (err) {
        return errorResult(describeError(err));
      }
    },
  );

  // -----------------------------------------------------------------------
  // Fixed commitments
  // -----------------------------------------------------------------------
  server.registerTool(
    "add_fixed_commitment",
    {
      title: "Add or update a fixed commitment",
      description:
        "Add a recurring fixed commitment (e.g. 'Rent', 'Gym') to a month, or update the " +
        "existing one with the same name. Optionally give it a due date and tag it to a " +
        "category. Writes to live data.",
      inputSchema: {
        name: z.string().min(1).describe("Name of the commitment, e.g. 'Rent'."),
        amount: z.number().positive().describe("Amount (£)."),
        month: monthArg,
        dueDate: z.string().regex(DATE_RE).optional().describe("Optional due date (YYYY-MM-DD)."),
        category: z.string().optional().describe("Optional category name to tag it to."),
      },
      outputSchema: writeResultShape,
      annotations: { readOnlyHint: false, title: "Add/update commitment" },
    },
    async ({ name, amount, month, dueDate, category }) => {
      try {
        const m = await resolveMonth(month);
        let budgetMonth: BudgetMonthFull;
        try {
          budgetMonth = await getBudgetMonth(m);
        } catch (err) {
          return errorResult(describeError(err, noMonthHint(m)));
        }

        const body: Record<string, unknown> = { name, amount };
        if (dueDate) body.dueDate = toIsoDay(dueDate);
        if (category) {
          const cats = await listCategories();
          const cat = findCategory(cats, category);
          if (!cat) return errorResult(`No category called "${category}".`);
          body.categoryId = cat.id;
        }

        const existing = findByName(budgetMonth.fixedCommitments, name);
        const result = existing
          ? await updateCommitment(existing.id, body)
          : await createCommitment(m, body);
        return writeResult(existing ? "updated" : "created", "fixed commitment", name, m, `£${amount}`, result);
      } catch (err) {
        return errorResult(describeError(err));
      }
    },
  );
}
