import { randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { buildServer } from "./mcp-server.js";

const app = express();

app.use(
  cors({
    // Browser-based MCP clients (e.g. the Inspector) need to read the session id.
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Last-Event-ID"],
  }),
);
app.use(express.json());

// Unauthenticated liveness probe — returns no financial data.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pennywise-mcp" });
});

// ---------------------------------------------------------------------------
// Auth: every /mcp request must present the shared secret, via either
//   Authorization: Bearer <token>   or   ?token=<token>
// (Bearer for header-capable clients / the Inspector; query param for ChatGPT's
// connector UI, which lets you paste a URL but not custom headers.)
// ---------------------------------------------------------------------------
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const q = req.query.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

function tokensMatch(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(config.authToken);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token || !tokensMatch(token)) {
    res
      .status(401)
      .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// MCP over Streamable HTTP (stateful sessions).
// ---------------------------------------------------------------------------
const transports = new Map<string, StreamableHTTPServerTransport>();

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
          transports.set(sid, newTransport);
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

app.listen(config.port, () => {
  console.log(
    `pennywise-mcp listening on http://localhost:${config.port}/mcp ` +
      `(proxying ${config.apiUrl})`,
  );
});
