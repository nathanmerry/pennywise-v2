import http from "node:http";
import { AddressInfo } from "node:net";
import { makeExport } from "./fixtures.js";

/**
 * In-process stand-in for the Pennywise backend covering every endpoint the MCP
 * bridge calls. Read routes return canned fixtures; write routes echo the
 * received body (+ path/method) so tests can assert the bridge resolved
 * names→ids and chose create-vs-update correctly.
 *
 * Months: 2026-07 (current), 2026-06 (populated), 2026-05 (empty export),
 * anything else → 404.
 */
const CURRENT_MONTH = "2026-07";
const SETUP_MONTHS = new Set(["2026-07", "2026-06"]); // months with a budget configured

// Cycles newest-first (index 0 = current). Midday UTC keeps the calendar day
// stable regardless of the test machine's timezone.
const CYCLE_MONTHS = ["2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"];
function buildCycles() {
  return CYCLE_MONTHS.map((month) => ({
    budgetMonth: month,
    startInclusive: `${month}-01T12:00:00.000Z`,
    endExclusive: `${month}-29T12:00:00.000Z`,
    cycleStartDate: `${month}-01T12:00:00.000Z`,
    cycleEndDate: `${month}-28T12:00:00.000Z`, // 28-day cycle → exactly 4 weeks
    daysInCycle: 28,
  }));
}

const CATEGORIES = [
  { id: "cat-eatingout", name: "Eating Out", parentId: null },
  { id: "cat-groceries", name: "Groceries", parentId: null },
  { id: "cat-coffee", name: "Coffee", parentId: "cat-eatingout" },
  { id: "cat-transport", name: "Transport", parentId: null },
];

const GROUPS = [{ id: "grp-1", name: "Essentials" }];

function budgetMonthFixture(month: string) {
  return {
    month,
    categoryPlans: [
      {
        id: "plan-eatingout",
        categoryId: "cat-eatingout",
        budgetGroupId: null,
        targetType: "fixed",
        targetValue: 250,
        category: { name: "Eating Out" },
        budgetGroup: null,
      },
      {
        id: "plan-essentials",
        categoryId: null,
        budgetGroupId: "grp-1",
        targetType: "fixed",
        targetValue: 500,
        category: null,
        budgetGroup: { name: "Essentials" },
      },
    ],
    plannedSpends: [{ id: "planned-1", name: "Flights" }],
    fixedCommitments: [{ id: "commit-1", name: "Rent" }],
  };
}

function analysisFixture(query: URLSearchParams) {
  const start = query.get("start") ?? "";
  const end = query.get("end") ?? "";
  const compare = query.get("compare") === "true";
  return {
    currentPeriod: { start, end, dayCount: 28 },
    previousPeriod: compare ? { start: "prev", end: "prev", dayCount: 28 } : null,
    budgetContext: { applicable: true, hasBudget: true },
    summary: {
      totalSpend: 1673,
      previousTotalSpend: compare ? 1500 : null,
      changeAmount: compare ? 173 : null,
      changePercent: compare ? 11.5 : null,
      avgPerDay: 59.75,
      transactionCount: 41,
      recurringSpend: 1125,
      flexibleSpend: 1673,
      fixedSpend: 0,
      highestCategory: { categoryId: "cat-rent", categoryName: "Rent", spend: 1125 },
    },
    series: [],
    categories: [
      {
        categoryId: "cat-rent",
        categoryName: "Rent",
        kind: "flexible",
        spend: 1125,
        shareOfTotal: 67,
        transactionCount: 1,
        averageTransaction: 1125,
        sparkline: [0, 1125, 0, 0],
        budget: null,
        plannedAmount: null,
      },
    ],
    topMerchants: [{ merchant: "Landlord", spend: 1125, transactionCount: 1 }],
    // Echo for assertions — tolerated by the tolerant outputSchema.
    _received: {
      start,
      end,
      preset: query.get("preset"),
      compare: query.get("compare"),
      includeIgnored: query.get("includeIgnored"),
    },
  };
}

function drilldownFixture(categoryId: string, query: URLSearchParams) {
  return {
    currentPeriod: { start: query.get("start") ?? "", end: query.get("end") ?? "", dayCount: 28 },
    previousPeriod: null,
    budget: null,
    category: { categoryId, categoryName: "Eating Out", spend: 137, transactionCount: 7, averageTransaction: 20 },
    series: [],
    topMerchants: [],
    transactions: [
      { transactionId: "tx1", transactionDate: "2026-07-02", merchantName: "Cafe", description: "COFFEE", amount: 4.5 },
    ],
    monthlyHistory: [],
    recurringSplit: { recurringSpend: 0, recurringTransactionCount: 0, oneOffSpend: 137, oneOffTransactionCount: 7 },
    weekdayWeekendSplit: { weekdaySpend: 100, weekendSpend: 37, weekdayTransactionCount: 5, weekendTransactionCount: 2 },
    _received: { categoryId, preset: query.get("preset"), start: query.get("start"), end: query.get("end") },
  };
}

function paceFixture(month: string) {
  return {
    month,
    totalDaysInMonth: 28,
    elapsedDays: 14,
    remainingDays: 14,
    elapsedRatio: 0.5,
    isCurrentMonth: true,
    isPastMonth: false,
    isFutureMonth: false,
    overall: {
      flexibleBudget: 1137,
      actualFlexibleSpendToDate: 607,
      expectedFlexibleSpendByNow: 568.5,
      paceDelta: 38.5,
      remainingFlexibleBudget: 530,
      safeDailySpend: 37.8,
      weeklyAllowance: 265,
      status: "on_track",
      fixedPlanned: 1563,
      actualFixedSpendToDate: 1466,
    },
    forecast: { projectedFlexibleSpend: 1214, projectedOverUnder: -77, isProjectedOver: true },
    categories: [
      { categoryId: "cat-eatingout", categoryName: "Eating Out", monthlyBudget: 400, actualSpendToDate: 186, expectedSpendByNow: 200, paceDelta: -14, remainingBudget: 214, status: "on_track" },
      { categoryId: "cat-groceries", categoryName: "Groceries", monthlyBudget: 350, actualSpendToDate: 166, expectedSpendByNow: 175, paceDelta: -9, remainingBudget: 184, status: "on_track" },
    ],
    highlights: { topOverPaceCategories: [] },
  };
}

export interface MockBackend {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export function startMockBackend(): Promise<MockBackend> {
  let writeSeq = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    const method = req.method ?? "GET";
    res.setHeader("Content-Type", "application/json");
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    // --- reads ---
    if (method === "GET" && p === "/api/budget/current") return send(200, { month: CURRENT_MONTH });
    if (method === "GET" && p === "/api/budget/cycles") return send(200, { cycles: buildCycles() });
    if (method === "GET" && p === "/api/categories") return send(200, CATEGORIES);
    if (method === "GET" && p === "/api/budget/groups") return send(200, GROUPS);
    if (method === "GET" && p === "/api/budget/analysis") return send(200, analysisFixture(url.searchParams));

    const drill = p.match(/^\/api\/budget\/analysis\/category\/(.+)$/);
    if (method === "GET" && drill) return send(200, drilldownFixture(decodeURIComponent(drill[1]), url.searchParams));

    const pace = p.match(/^\/api\/budget\/pace\/([^/]+)$/);
    if (method === "GET" && pace) {
      const month = decodeURIComponent(pace[1]);
      if (!SETUP_MONTHS.has(month)) return send(404, { error: "Budget month not found." });
      return send(200, paceFixture(month));
    }

    const exportMatch = p.match(/^\/api\/budget\/export\/(.+)$/);
    if (method === "GET" && exportMatch) {
      const month = decodeURIComponent(exportMatch[1]);
      if (month === "2026-05") return send(200, makeExport(month, { empty: true }));
      if (SETUP_MONTHS.has(month)) return send(200, makeExport(month));
      return send(404, { error: "Budget month not found." });
    }

    const monthMatch = p.match(/^\/api\/budget\/months\/([^/]+)$/);
    if (method === "GET" && monthMatch) {
      const month = decodeURIComponent(monthMatch[1]);
      if (!SETUP_MONTHS.has(month)) return send(404, { error: "Budget month not found" });
      return send(200, budgetMonthFixture(month));
    }

    // --- writes (echo body + path so tests can assert resolution) ---
    if (method === "POST" || method === "PATCH") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const echo = { id: `w${++writeSeq}`, ...body, _path: p, _method: method };
      // month must exist for the create-under-month routes
      const underMonth = p.match(/^\/api\/budget\/months\/([^/]+)\/(plans|planned|commitments)$/);
      if (method === "POST" && underMonth && !SETUP_MONTHS.has(decodeURIComponent(underMonth[1]))) {
        return send(404, { error: "Budget month not found" });
      }
      const patchMonth = p.match(/^\/api\/budget\/months\/([^/]+)$/);
      if (method === "PATCH" && patchMonth && !SETUP_MONTHS.has(decodeURIComponent(patchMonth[1]))) {
        return send(404, { error: "Budget month not found" });
      }
      const knownWrite =
        underMonth ||
        patchMonth ||
        /^\/api\/budget\/(plans|planned|commitments)\/[^/]+$/.test(p);
      if (knownWrite) return send(method === "POST" ? 201 : 200, echo);
      return send(404, { error: "not found" });
    }

    return send(404, { error: "not found" });
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://localhost:${port}`,
        port,
        close: () => new Promise<void>((r, rej) => server.close((e) => (e ? rej(e) : r()))),
      });
    });
  });
}
