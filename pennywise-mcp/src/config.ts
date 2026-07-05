import "dotenv/config";
import { z } from "zod";

/**
 * Configuration for the Pennywise MCP bridge.
 *
 * The bridge is a thin, authenticated front door in front of the existing
 * Pennywise backend API. It holds no financial logic of its own — every number
 * it returns comes from the backend's calculation services (see
 * services/monthly-export.ts), so it can never drift from what the app shows.
 */
const schema = z.object({
  /** Base URL of the running Pennywise backend (the thing serving /api/budget/...). */
  PENNYWISE_API_URL: z.string().url().default("http://localhost:3382"),
  /**
   * Shared secret every MCP client (ChatGPT, MCP Inspector, curl) must present,
   * either as `Authorization: Bearer <token>` or a `?token=<token>` query param.
   * Required — the server refuses to start without it so the endpoint is never
   * unauthenticated in front of sensitive financial data.
   */
  MCP_AUTH_TOKEN: z
    .string()
    .min(24, "MCP_AUTH_TOKEN must be at least 24 characters (use e.g. `openssl rand -hex 32`)"),
  /** Port this MCP server listens on. */
  MCP_PORT: z.coerce.number().int().positive().default(3391),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid pennywise-mcp configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in the values.");
  process.exit(1);
}

export const config = {
  apiUrl: parsed.data.PENNYWISE_API_URL.replace(/\/+$/, ""),
  authToken: parsed.data.MCP_AUTH_TOKEN,
  port: parsed.data.MCP_PORT,
} as const;
