import http from "node:http";
import { AddressInfo } from "node:net";
import { makeExport } from "./fixtures.js";

/**
 * In-process stand-in for the Pennywise backend, matching the endpoints the MCP
 * bridge calls. Lets the integration tests exercise the full path without any
 * real database. Months:
 *   2026-07 -> current (also what /api/budget/current resolves to)
 *   2026-06 -> a populated past month
 *   2026-05 -> a valid-but-empty month (budget, zero transactions)
 *   anything else -> 404
 */
const CURRENT_MONTH = "2026-07";

export interface MockBackend {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export function startMockBackend(): Promise<MockBackend> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Content-Type", "application/json");

    if (url.pathname === "/api/budget/current") {
      res.end(JSON.stringify({ month: CURRENT_MONTH }));
      return;
    }

    const match = url.pathname.match(/^\/api\/budget\/export\/(.+)$/);
    if (match) {
      const month = decodeURIComponent(match[1]);
      if (month === CURRENT_MONTH || month === "2026-06") {
        res.end(JSON.stringify(makeExport(month)));
      } else if (month === "2026-05") {
        res.end(JSON.stringify(makeExport(month, { empty: true })));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Budget month not found." }));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://localhost:${port}`,
        port,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
