import { config } from "./config.js";

/**
 * Minimal HTTP client for the Pennywise backend API.
 *
 * This is deliberately thin: it makes GET requests to existing endpoints and
 * returns their JSON verbatim. No calculation, reshaping, or business logic
 * lives here — the backend is the single source of truth.
 */

export class PennywiseApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PennywiseApiError";
    this.status = status;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PennywiseApiError(
      `Could not reach the Pennywise backend at ${config.apiUrl} (${reason}). Is it running?`,
      0,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: unknown };
      if (body?.error) {
        detail = ` – ${typeof body.error === "string" ? body.error : JSON.stringify(body.error)}`;
      }
    } catch {
      // non-JSON error body; ignore
    }
    throw new PennywiseApiError(`GET ${path} failed (${res.status})${detail}`, res.status);
  }

  return (await res.json()) as T;
}

/** POST/PATCH helper for the write endpoints. Same error semantics as apiGet. */
async function apiSend<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PennywiseApiError(
      `Could not reach the Pennywise backend at ${config.apiUrl} (${reason}). Is it running?`,
      0,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: unknown };
      if (errBody?.error) {
        detail = ` – ${typeof errBody.error === "string" ? errBody.error : JSON.stringify(errBody.error)}`;
      }
    } catch {
      // non-JSON error body; ignore
    }
    throw new PennywiseApiError(`${method} ${path} failed (${res.status})${detail}`, res.status);
  }

  return (await res.json()) as T;
}

/**
 * Resolve the currently-active budget month (YYYY-MM).
 *
 * Uses the backend's /api/budget/current, which returns the pay cycle that
 * contains today (falling back to the most recent cycle) — the exact same
 * "current month" the app's UI shows.
 */
export async function getActiveMonth(): Promise<string> {
  const overview = await apiGet<{ month: string }>("/api/budget/current");
  return overview.month;
}

/**
 * Fetch the structured monthly export for a budget month (YYYY-MM).
 *
 * This is the backend's LLM-oriented snapshot: totals, category breakdown, top
 * merchants, the full transaction ledger (with notes + ignored flags), budget
 * context, and plain-English guidance on how to read the numbers. Returned
 * verbatim for the model to reason over.
 */
export async function getMonthlyExport(month: string): Promise<unknown> {
  return apiGet<unknown>(`/api/budget/export/${encodeURIComponent(month)}`);
}

// ---------------------------------------------------------------------------
// Spending analysis (read) — the /spending page
// ---------------------------------------------------------------------------

/** One recent pay cycle, as returned by GET /api/budget/cycles. */
export interface CycleSummary {
  budgetMonth: string;
  startInclusive: string;
  endExclusive: string;
  cycleStartDate: string;
  cycleEndDate: string;
  daysInCycle: number;
}

/** Most recent N pay cycles, newest first (index 0 = current cycle). */
export async function getRecentCycles(count = 12): Promise<CycleSummary[]> {
  const body = await apiGet<{ cycles: CycleSummary[] }>(`/api/budget/cycles?count=${count}`);
  return body.cycles;
}

/** Range-based spending analysis (category breakdown, series, top merchants). */
export async function getSpendingAnalysis(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return apiGet<unknown>(`/api/budget/analysis?${qs}`);
}

/** Budget pace for a month (spend-to-date vs expected-by-now, overall + per category). */
export async function getBudgetPace(month: string): Promise<unknown> {
  return apiGet<unknown>(`/api/budget/pace/${encodeURIComponent(month)}`);
}

/** Per-category drilldown for a range. */
export async function getCategoryDrilldown(
  categoryId: string,
  params: Record<string, string>,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return apiGet<unknown>(`/api/budget/analysis/category/${encodeURIComponent(categoryId)}?${qs}`);
}

// ---------------------------------------------------------------------------
// Budget structure + writes — the /budget page (core knobs, create/update only)
// ---------------------------------------------------------------------------

/** Minimal shape we read from GET /api/budget/months/:month for name→id resolution. */
export interface BudgetMonthFull {
  month: string;
  categoryPlans: Array<{
    id: string;
    categoryId: string | null;
    budgetGroupId: string | null;
    targetType: "fixed" | "percent";
    targetValue: number | string;
    category?: { name: string } | null;
    budgetGroup?: { name: string } | null;
  }>;
  plannedSpends: Array<{ id: string; name: string }>;
  fixedCommitments: Array<{ id: string; name: string }>;
}

export interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
}

/** Full budget month (plans, planned spends, commitments) — 404s if not set up. */
export async function getBudgetMonth(month: string): Promise<BudgetMonthFull> {
  return apiGet<BudgetMonthFull>(`/api/budget/months/${encodeURIComponent(month)}`);
}

export async function listCategories(): Promise<CategoryRow[]> {
  return apiGet<CategoryRow[]>(`/api/categories`);
}

export async function listGroups(): Promise<GroupRow[]> {
  return apiGet<GroupRow[]>(`/api/budget/groups`);
}

export async function createCategoryPlan(month: string, body: unknown): Promise<unknown> {
  return apiSend("POST", `/api/budget/months/${encodeURIComponent(month)}/plans`, body);
}

export async function updateCategoryPlan(id: string, body: unknown): Promise<unknown> {
  return apiSend("PATCH", `/api/budget/plans/${encodeURIComponent(id)}`, body);
}

export async function patchBudgetMonth(month: string, body: unknown): Promise<unknown> {
  return apiSend("PATCH", `/api/budget/months/${encodeURIComponent(month)}`, body);
}

export async function createPlannedSpend(month: string, body: unknown): Promise<unknown> {
  return apiSend("POST", `/api/budget/months/${encodeURIComponent(month)}/planned`, body);
}

export async function updatePlannedSpend(id: string, body: unknown): Promise<unknown> {
  return apiSend("PATCH", `/api/budget/planned/${encodeURIComponent(id)}`, body);
}

export async function createCommitment(month: string, body: unknown): Promise<unknown> {
  return apiSend("POST", `/api/budget/months/${encodeURIComponent(month)}/commitments`, body);
}

export async function updateCommitment(id: string, body: unknown): Promise<unknown> {
  return apiSend("PATCH", `/api/budget/commitments/${encodeURIComponent(id)}`, body);
}
