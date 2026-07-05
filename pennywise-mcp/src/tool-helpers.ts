import { PennywiseApiError } from "./pennywise-client.js";

/** Result carrying data in both structuredContent and text (full JSON). */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** Result with a short human text summary + structured data (token-efficient for big payloads). */
export function textAndStructured(text: string, data: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** A handled, model-readable error (isError=true — skips output-schema validation). */
export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Turn a thrown error into a friendly, model-usable message. */
export function describeError(err: unknown, notFoundHint?: string): string {
  if (err instanceof PennywiseApiError) {
    if (err.status === 404 && notFoundHint) return notFoundHint;
    if (err.status === 0) return err.message; // "could not reach backend…"
    return `Pennywise API error: ${err.message}`;
  }
  // Plain Errors (e.g. range/validation failures) carry a friendly message already.
  return err instanceof Error ? err.message : String(err);
}
