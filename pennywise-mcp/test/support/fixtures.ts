/**
 * Representative MonthlyExport fixtures, mirroring services/monthly-export.ts.
 * Shared by the schema tests and the mock backend.
 */

export interface FixtureOptions {
  /** Produce a valid-but-empty month (budget exists, no spend/transactions). */
  empty?: boolean;
}

export function makeExport(month: string, opts: FixtureOptions = {}): Record<string, unknown> {
  const empty = opts.empty ?? false;
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-05T00:00:00.000Z",
    currency: "GBP",
    month,
    guidance: [
      "A 'month' in this export is a pay cycle, not a calendar month.",
      "actualSpend and every 'spent' figure EXCLUDE ignored transactions.",
    ],
    cycle: {
      label: `${month} cycle`,
      startDate: `${month}-01`,
      endDate: `${month}-28`,
      daysInCycle: 28,
      daysElapsed: 5,
      daysRemaining: 23,
      status: "current",
    },
    summary: {
      expectedIncome: 3200,
      savingsTarget: 400,
      fixedCommitmentsTotal: 900,
      plannedOneOffsTotal: 100,
      eventsReservedTotal: 0,
      flexibleBudget: 1800,
      unallocated: 0,
      actualSpend: empty ? 0 : 642.18,
      remainingFlexible: empty ? 1800 : 1157.82,
      moneyIn: 3200,
      moneyOut: empty ? 0 : 642.18,
      netAfterIgnored: empty ? 3200 : 2557.82,
    },
    budget: {
      fixedCommitments: [],
      plannedOneOffs: [],
      categoryBudgets: [],
      budgetGroups: [],
      events: [],
    },
    spending: {
      byCategory: empty
        ? []
        : [
            { category: "Eating Out", spent: 210.5, budget: 250, remaining: 39.5, percentUsed: 84 },
            { category: "Groceries", spent: 180.2, budget: 300, remaining: 119.8, percentUsed: 60 },
            // A category with no budget — exercises the nullable fields.
            { category: "Transport", spent: 95.0, budget: null, remaining: null, percentUsed: null },
          ],
      topMerchants: empty ? [] : [{ merchant: "Tesco", spent: 120.4, transactionCount: 6 }],
    },
    transactions: empty
      ? []
      : [
          {
            date: `${month}-02`,
            description: "TESCO STORES",
            merchant: "Tesco",
            amount: 42.1,
            categories: ["Groceries"],
            note: null,
            ignored: false,
          },
          {
            // Ignored income row with a note + null merchant — exercises nullables + the ignored flag.
            date: `${month}-03`,
            description: "AMEX PAYMENT",
            merchant: null,
            amount: 500,
            categories: [],
            note: "credit card bill",
            ignored: true,
          },
        ],
  };
}
