/**
 * Smoke test for the Pennywise MCP bridge.
 *
 * Exercises the real MCP protocol the way ChatGPT would:
 *   1. Rejects a bad token (auth gate works).
 *   2. Connects with the real token, lists tools (expects the 2 spending tools).
 *   3. Optionally calls get_current_month_spending_summary (needs the backend up).
 *
 * Usage:
 *   node smoke-test.mjs            # protocol + auth checks
 *   node smoke-test.mjs --call     # also call the current-month tool (backend must be running)
 *
 * Reads MCP_PORT and MCP_AUTH_TOKEN from .env.
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = process.env.MCP_PORT || "3391";
const TOKEN = process.env.MCP_AUTH_TOKEN;
const BASE = `http://localhost:${PORT}/mcp`;
const doCall = process.argv.includes("--call");

if (!TOKEN) {
  console.error("MCP_AUTH_TOKEN missing from .env");
  process.exit(1);
}

function connect(token) {
  const client = new Client({ name: "smoke-test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(BASE), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, transport };
}

let failures = 0;
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => {
  console.log(`  ❌ ${m}`);
  failures++;
};

// 1. Bad token must be rejected.
console.log("1. Auth gate (bad token):");
try {
  const { client, transport } = connect("definitely-the-wrong-token");
  await client.connect(transport);
  fail("connected with a bad token — auth gate is NOT working");
  await client.close();
} catch {
  pass("rejected bad token");
}

// 2. Real token: initialize + list tools.
console.log("2. Connect + list tools (real token):");
let client;
try {
  const conn = connect(TOKEN);
  client = conn.client;
  await client.connect(conn.transport);
  pass("connected");
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`     tools: ${names.join(", ")}`);
  const expected = ["get_current_month_spending_summary", "get_spending_summary_for_month"];
  if (expected.every((n) => names.includes(n))) pass("both spending tools present");
  else fail(`missing tools (expected ${expected.join(", ")})`);
} catch (err) {
  fail(`could not connect/list: ${err?.message ?? err}`);
}

// 3. Optional: call the current-month tool (requires the backend running).
if (doCall && client) {
  console.log("3. Call get_current_month_spending_summary:");
  try {
    const result = await client.callTool({
      name: "get_current_month_spending_summary",
      arguments: {},
    });
    const text = result.content?.[0]?.text ?? "";
    if (result.isError) {
      console.log(`     tool returned a handled error: ${text}`);
      pass("tool responded (error path handled gracefully)");
    } else {
      const data = JSON.parse(text);
      console.log(
        `     month=${data.month} total=${data.currency} ${data.summary?.actualSpend} ` +
          `categories=${data.spending?.byCategory?.length} txns=${data.transactions?.length}`,
      );
      pass("tool returned a spending summary");
    }
  } catch (err) {
    fail(`tool call threw: ${err?.message ?? err}`);
  }
}

if (client) await client.close();
console.log(failures === 0 ? "\nAll checks passed ✅" : `\n${failures} check(s) failed ❌`);
process.exit(failures === 0 ? 0 : 1);
