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
