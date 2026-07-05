import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Separate file so it runs in its own process with the backend URL pointing at a
// closed port — verifies the "backend unreachable" path independently.
describe("pennywise-client (backend unreachable)", () => {
  let client: typeof import("../src/pennywise-client.js");

  before(async () => {
    process.env.PENNYWISE_API_URL = "http://127.0.0.1:1"; // nothing listens here
    process.env.MCP_AUTH_TOKEN = "test-secret-token-1234567890";
    client = await import("../src/pennywise-client.js");
  });

  it("throws a helpful PennywiseApiError(0) when the backend is down", async () => {
    await assert.rejects(
      () => client.getActiveMonth(),
      (err: unknown) =>
        err instanceof client.PennywiseApiError &&
        err.status === 0 &&
        /Could not reach the Pennywise backend/.test(err.message),
    );
  });
});
