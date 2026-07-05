import { timingSafeEqual } from "node:crypto";

/**
 * Pure auth helpers — no config/env dependency so they're trivially unit-testable.
 * The Express middleware that wires these to the configured secret lives in index.ts.
 */

/** Minimal view of the parts of a request we read a token from. */
export interface TokenBearingRequest {
  headers: { authorization?: string | string[] | undefined };
  query: Record<string, unknown>;
}

/**
 * Extract the shared secret from a request. Accepts either:
 *   - `Authorization: Bearer <token>` header (header-capable clients), or
 *   - `?token=<token>` query param (ChatGPT's connector UI, which takes a URL
 *     but not a custom header).
 * Returns null when neither is present / non-empty.
 */
export function extractToken(req: TokenBearingRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
  const q = req.query.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

/** Constant-time comparison of a provided token against the expected secret. */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
