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
  /**
   * Port this MCP server listens on. Falls back to PORT (injected by most
   * platform hosts, e.g. DigitalOcean App Platform sets PORT=8080 and
   * health-checks that port) before the local default.
   */
  MCP_PORT: z.coerce.number().int().positive().default(3391),
  PORT: z.coerce.number().int().positive().optional(),
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
  // PORT (injected by the platform host) is authoritative when present — the
  // host health-checks that exact port. MCP_PORT is the local-dev default.
  port: parsed.data.PORT ?? parsed.data.MCP_PORT,
} as const;
