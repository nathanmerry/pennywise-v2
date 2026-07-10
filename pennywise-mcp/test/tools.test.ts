import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMockBackend, type MockBackend } from "./support/mock-backend.js";

const TOKEN = "test-secret-token-1234567890"; // >= 24 chars, satisfies config

/**
 * Full-path integration: real MCP client -> auth -> tools -> mock backend.
 * Mirrors how ChatGPT drives the server.
 */
describe("tools integration", () => {
  let mock: MockBackend;
  let httpServer: Server;
  let baseUrl: string;
  let client: Client;

  before(async () => {
    mock = await startMockBackend();
    process.env.PENNYWISE_API_URL = mock.url;
    process.env.MCP_AUTH_TOKEN = TOKEN;

    // Import AFTER env is set so config picks up the mock URL + test token.
    const { createApp } = await import("../src/index.js");
    httpServer = createApp().listen(0);
    await new Promise<void>((resolve) => httpServer.once("listening", () => resolve()));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}/mcp`;

    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(baseUrl), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      }),
    );
  });

  after(async () => {
    await client?.close();
    if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mock?.close();
  });

  it("rejects a client presenting a bad token", async () => {
    const bad = new Client({ name: "bad", version: "0" });
    await assert.rejects(() =>
      bad.connect(
        new StreamableHTTPClientTransport(new URL(baseUrl), {
          requestInit: { headers: { Authorization: "Bearer definitely-wrong" } },
        }),
      ),
    );
  });

  it("advertises all tools, each with an outputSchema; writes are not read-only", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of [
      "get_current_month_spending_summary",
      "get_spending_summary_for_month",
      "get_spending_analysis",
      "get_category_drilldown",
      "get_budget_pace",
      "set_category_budget",
      "update_budget_month",
      "add_planned_spend",
      "add_fixed_commitment",
      "add_transaction",
    ]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }
    for (const t of tools) assert.ok(t.outputSchema, `${t.name} should advertise an outputSchema`);
    // Read tools are flagged read-only; write tools are not.
    const byName = new Map(tools.map((t) => [t.name, t]));
    assert.equal(byName.get("get_spending_analysis")?.annotations?.readOnlyHint, true);
    assert.equal(byName.get("set_category_budget")?.annotations?.readOnlyHint, false);
  });

  it("current-month summary returns structuredContent with the FULL ledger (not stripped)", async () => {
    const r = await client.callTool({
      name: "get_current_month_spending_summary",
      arguments: {},
    });
    assert.notEqual(r.isError, true);
    const sc = r.structuredContent as {
      month: string;
      transactions: unknown[];
      spending: { byCategory: Array<{ category: string }> };
    };
    assert.equal(sc.month, "2026-07");
    assert.equal(sc.transactions.length, 2, "full transaction ledger should survive validation");
    assert.equal(sc.spending.byCategory[0].category, "Eating Out");
  });

  it("summary for a specific month returns that month", async () => {
    const r = await client.callTool({
      name: "get_spending_summary_for_month",
      arguments: { month: "2026-06" },
    });
    assert.equal((r.structuredContent as { month: string }).month, "2026-06");
  });

  it("an empty month is a valid (non-error) result", async () => {
    const r = await client.callTool({
      name: "get_spending_summary_for_month",
      arguments: { month: "2026-05" },
    });
    assert.notEqual(r.isError, true);
    assert.equal((r.structuredContent as { transactions: unknown[] }).transactions.length, 0);
  });

  it("a missing month returns a friendly error result", async () => {
    const r = await client.callTool({
      name: "get_spending_summary_for_month",
      arguments: { month: "2099-01" },
    });
    assert.equal(r.isError, true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    assert.match(text, /No budget is configured for 2099-01/);
  });

  it("a bad month format is rejected by input-schema validation", async () => {
    const r = await client.callTool({
      name: "get_spending_summary_for_month",
      arguments: { month: "July" },
    });
    assert.equal(r.isError, true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    assert.match(text, /YYYY-MM/);
  });

  it("health endpoint is unauthenticated and returns ok", async () => {
    const origin = baseUrl.replace(/\/mcp$/, "");
    const res = await fetch(`${origin}/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  it("POST /mcp with NO token → 401 'missing credentials'", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(res.status, 401);
    assert.match((await res.json()).error.message, /missing credentials/i);
  });

  it("POST /mcp with a WRONG token → 401 'invalid token'", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(res.status, 401);
    assert.match((await res.json()).error.message, /invalid token/i);
  });

  it("GET /mcp with a valid token but no session → 404", async () => {
    const res = await fetch(baseUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "text/event-stream" },
    });
    assert.equal(res.status, 404);
  });
});
