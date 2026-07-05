import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockBackend, type MockBackend } from "./support/mock-backend.js";

// Runs in its own process (test isolation), so setting env before the dynamic
// import lets config.ts pick up the mock backend URL.
describe("pennywise-client", () => {
  let mock: MockBackend;
  let client: typeof import("../src/pennywise-client.js");

  before(async () => {
    mock = await startMockBackend();
    process.env.PENNYWISE_API_URL = mock.url;
    process.env.MCP_AUTH_TOKEN = "test-secret-token-1234567890";
    client = await import("../src/pennywise-client.js");
  });

  after(async () => {
    await mock.close();
  });

  it("getActiveMonth resolves the backend's current month", async () => {
    assert.equal(await client.getActiveMonth(), "2026-07");
  });

  it("getMonthlyExport returns the export for a populated month", async () => {
    const exp = (await client.getMonthlyExport("2026-06")) as { month: string };
    assert.equal(exp.month, "2026-06");
  });

  it("getMonthlyExport throws PennywiseApiError(404) for a missing month", async () => {
    await assert.rejects(
      () => client.getMonthlyExport("2099-01"),
      (err: unknown) =>
        err instanceof client.PennywiseApiError && err.status === 404,
    );
  });
});
