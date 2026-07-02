import type { MonthlyExport } from "@/shared/lib/api";

/**
 * Renders a MonthlyExport as human-readable Markdown. Presentation only — every
 * number is taken verbatim from the structured payload (which the backend
 * computed via the shared calculation services). No maths happens here.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Collapse newlines/whitespace so a value stays on one line in list rows. */
function inline(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Escape a value for use inside a Markdown table cell. */
function cell(s: string): string {
  return inline(s).replace(/\|/g, "\\|");
}

/** Format a YYYY-MM-DD string without timezone drift. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function shortDateNoYear(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function monthlyExportToMarkdown(data: MonthlyExport): string {
  const fmt = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: data.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (n: number) => fmt.format(n);

  const lines: string[] = [];
  const { cycle, summary, budget, spending, transactions } = data;

  // ---- Header ----
  lines.push(`# ${cycle.label}`);
  lines.push(
    `${shortDate(cycle.startDate)} – ${shortDate(cycle.endDate)} · ${cycle.daysInCycle} days · ${cycle.status} cycle`,
  );
  lines.push(
    `_Snapshot of budget ${data.month}. All amounts in ${data.currency}. Negative transaction amounts are money out._`,
  );
  lines.push("");

  // ---- How to read this ----
  if (data.guidance.length > 0) {
    lines.push("## How to read this");
    for (const g of data.guidance) lines.push(`- ${g}`);
    lines.push("");
  }

  // ---- Summary ----
  lines.push("## Summary");
  lines.push(`- Expected income: ${money(summary.expectedIncome)}`);
  lines.push(`- Savings target: ${money(summary.savingsTarget)}`);
  lines.push(`- Fixed commitments: ${money(summary.fixedCommitmentsTotal)}`);
  lines.push(`- Planned one-offs: ${money(summary.plannedOneOffsTotal)}`);
  lines.push(
    `- Flexible budget (everyday spending, after savings/fixed/planned/event reserves): ${money(summary.flexibleBudget)}`,
  );
  lines.push(
    `- Spent so far: ${money(summary.actualSpend)} · Flexible remaining: ${money(summary.remainingFlexible)}`,
  );
  if (summary.eventsReservedTotal > 0) {
    lines.push(
      `- Reserved for events/trips (separate envelope — NOT part of the flexible budget above): ${money(summary.eventsReservedTotal)}`,
    );
  }
  lines.push(
    summary.unallocated < 0
      ? `- Over-committed (category budgets exceed flexible): ${money(Math.abs(summary.unallocated))}`
      : `- Unallocated flexible: ${money(summary.unallocated)}`,
  );
  lines.push(
    `- Money in: ${money(summary.moneyIn)} · Money out: ${money(summary.moneyOut)} · Net (excl. ignored): ${money(summary.netAfterIgnored)}`,
  );
  lines.push("");

  // ---- Fixed commitments ----
  if (budget.fixedCommitments.length > 0) {
    lines.push("## Fixed commitments");
    for (const c of budget.fixedCommitments) {
      const parts = [`**${c.name}** — ${money(c.amount)}`];
      if (c.category) parts.push(`(${c.category})`);
      if (c.dueDate) parts.push(`due ${shortDateNoYear(c.dueDate)}`);
      lines.push(`- ${parts.join(" ")}`);
    }
    lines.push("");
  }

  // ---- Planned one-offs ----
  if (budget.plannedOneOffs.length > 0) {
    lines.push("## Planned one-offs");
    for (const p of budget.plannedOneOffs) {
      const tags = [p.category ?? p.budgetGroup, p.plannedDate ? shortDateNoYear(p.plannedDate) : null, p.isEssential ? "essential" : null]
        .filter(Boolean)
        .join(", ");
      lines.push(`- **${p.name}** — ${money(p.amount)}${tags ? ` (${tags})` : ""}`);
    }
    lines.push("");
  }

  // ---- Category budgets ----
  if (budget.categoryBudgets.length > 0) {
    lines.push("## Category budgets");
    lines.push("| Category | Budget | Spent | Remaining |");
    lines.push("| --- | --- | --- | --- |");
    for (const b of budget.categoryBudgets) {
      const label = b.targetType === "percent" ? `${b.name} (${b.target}%)` : b.name;
      lines.push(`| ${cell(label)} | ${money(b.resolvedAmount)} | ${money(b.spent)} | ${money(b.remaining)} |`);
    }
    lines.push("");
  }

  // ---- Budget groups (grouped budgeting) ----
  if (budget.budgetGroups.length > 0) {
    lines.push("## Budget groups");
    for (const g of budget.budgetGroups) {
      const budgetPart = g.budget === null ? "no budget" : money(g.budget);
      const remainingPart = g.remaining === null ? "" : ` · ${money(g.remaining)} left`;
      lines.push(`- **${g.name}** — spent ${money(g.spent)} of ${budgetPart}${remainingPart}`);
      if (g.categories.length > 0) {
        lines.push(`  - Categories: ${g.categories.join(", ")}`);
      }
    }
    lines.push("");
  }

  // ---- Events ----
  if (budget.events.length > 0) {
    lines.push("## Events");
    for (const e of budget.events) {
      lines.push(
        `- **${e.name}** (${shortDateNoYear(e.startDate)} – ${shortDateNoYear(e.endDate)}) — cap ${money(e.cap)}, spent ${money(e.actualSpend)} · funded from ${e.fundingSource}`,
      );
      if (e.notes) lines.push(`  - ${inline(e.notes)}`);
      for (const pot of e.pots) {
        const spent = pot.actualSpend === null ? "" : `, spent ${money(pot.actualSpend)}`;
        lines.push(`  - ${inline(pot.name)}: ${money(pot.amount)}${spent}${pot.category ? ` (${inline(pot.category)})` : ""}`);
      }
    }
    lines.push("");
  }

  // ---- Spending by category ----
  if (spending.byCategory.length > 0) {
    lines.push("## Spending by category");
    lines.push("| Category | Spent | Budget | Remaining |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of spending.byCategory) {
      lines.push(
        `| ${cell(c.category)} | ${money(c.spent)} | ${c.budget === null ? "—" : money(c.budget)} | ${c.remaining === null ? "—" : money(c.remaining)} |`,
      );
    }
    lines.push("");
  }

  // ---- Top merchants ----
  if (spending.topMerchants.length > 0) {
    lines.push("## Top merchants");
    for (const m of spending.topMerchants) {
      lines.push(`- ${inline(m.merchant)}: ${money(m.spent)} (${m.transactionCount} txns)`);
    }
    lines.push("");
  }

  // ---- Transactions ----
  // Split into spending (non-ignored outflows) vs everything else so the
  // per-category subtotals reconcile with actual spend. The "Spending by
  // category" table above rolls up to top-level categories and drops
  // ignored/income/ambiguous rows; this ledger groups by each transaction's
  // own (often more granular) category, so the two are related but not identical.
  if (transactions.length > 0) {
    const outflows = transactions.filter((t) => !t.ignored && t.amount < 0);
    const other = transactions.filter((t) => t.ignored || t.amount >= 0);

    lines.push("## Transactions");
    lines.push(
      "_Spending grouped by each transaction's assigned category (subtotals = non-ignored outflows only). Income and excluded transactions are listed separately and are not in the subtotals, so this section may not sum exactly to the rolled-up Spending table above._",
    );
    lines.push("");

    const groups = new Map<string, { total: number; txs: typeof transactions }>();
    for (const tx of outflows) {
      const key = tx.categories[0] ?? "Uncategorised";
      const g = groups.get(key) ?? { total: 0, txs: [] };
      g.total += Math.abs(tx.amount);
      g.txs.push(tx);
      groups.set(key, g);
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
    for (const [name, group] of sorted) {
      lines.push(`### ${inline(name)} — ${money(group.total)}`);
      for (const tx of group.txs) {
        const bits = [`${shortDateNoYear(tx.date)} · ${inline(tx.description)} · ${money(tx.amount)}`];
        if (tx.note) bits.push(`note: ${inline(tx.note)}`);
        lines.push(`- ${bits.join(" — ")}`);
      }
      lines.push("");
    }

    if (other.length > 0) {
      lines.push("### Income, transfers & excluded");
      for (const tx of other) {
        const bits = [`${shortDateNoYear(tx.date)} · ${inline(tx.description)} · ${money(tx.amount)}`];
        if (tx.categories[0]) bits.push(inline(tx.categories[0]));
        if (tx.note) bits.push(`note: ${inline(tx.note)}`);
        if (tx.ignored) bits.push("excluded from reporting");
        lines.push(`- ${bits.join(" — ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
