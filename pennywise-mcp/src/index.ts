import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { buildServer } from "./mcp-server.js";
import { extractToken, tokensMatch } from "./auth.js";

/**
 * Build the Express app hosting the MCP endpoint. Exported (rather than started
 * inline) so tests can mount it on an ephemeral port. Call listen() separately —
 * see the run-as-main block at the bottom.
 */
export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      // Browser-based MCP clients (e.g. the Inspector) need to read the session id.
      exposedHeaders: ["Mcp-Session-Id"],
      // Mcp-Protocol-Version is attached by MCP clients on every post-initialize
      // request; omitting it here makes CORS preflight reject those requests for
      // browser-origin clients.
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Accept",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
        "Last-Event-ID",
      ],
    }),
  );
  app.use(express.json());

  // Unauthenticated liveness probe — returns no financial data.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "pennywise-mcp" });
  });

  // Every /mcp request must present the shared secret (Bearer header or ?token=).
  // Distinct messages for missing vs invalid so a misconfigured client gets a
  // useful hint rather than a bare 401.
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Unauthorized: missing credentials. Provide the shared secret via an " +
            "'Authorization: Bearer <token>' header or a '?token=<token>' query parameter.",
        },
        id: null,
      });
      return;
    }
    if (!tokensMatch(token, config.authToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: invalid token." },
        id: null,
      });
      return;
    }
    next();
  }

  // -------------------------------------------------------------------------
  // MCP over Streamable HTTP (stateful sessions).
  // -------------------------------------------------------------------------
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Bound memory for this long-lived process. ChatGPT's connector often never
  // sends a DELETE to close a session, and with enableJsonResponse the POST path
  // doesn't close the transport either — so without a cap the Map (and the
  // McpServer each transport holds) would grow without limit. Evict the oldest
  // session when we exceed the cap (Map preserves insertion order).
  const MAX_SESSIONS = 50;
  function rememberSession(sid: string, transport: StreamableHTTPServerTransport): void {
    transports.set(sid, transport);
    while (transports.size > MAX_SESSIONS) {
      const oldest = transports.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = transports.get(oldest);
      transports.delete(oldest);
      void evicted?.close();
    }
  }

  app.post("/mcp", requireAuth, async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (sessionId) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          });
          return;
        }
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: no session id and not an initialize request",
            },
            id: null,
          });
          return;
        }

        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            rememberSession(sid, newTransport);
          },
          onsessionclosed: (sid) => {
            transports.delete(sid);
          },
        });
        newTransport.onclose = () => {
          const sid = newTransport.sessionId;
          if (sid) transports.delete(sid);
        };

        await buildServer().connect(newTransport);
        transport = newTransport;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP POST:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET (server->client SSE stream) and DELETE (session teardown) for an existing session.
  async function handleExistingSession(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    await transport.handleRequest(req, res);
  }

  app.get("/mcp", requireAuth, handleExistingSession);
  app.delete("/mcp", requireAuth, handleExistingSession);

  return app;
}

// Run as a server only when executed directly (not when imported by tests).
// Use fileURLToPath (not URL.pathname) so this stays correct for paths with
// spaces or symlinked deploy layouts.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(config.port, () => {
    console.log(
      `pennywise-mcp listening on http://localhost:${config.port}/mcp ` +
        `(proxying ${config.apiUrl})`,
    );
  });
}
