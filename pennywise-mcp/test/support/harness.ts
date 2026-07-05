import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMockBackend, type MockBackend } from "./mock-backend.js";

const TOKEN = "test-secret-token-1234567890";

export interface Harness {
  client: Client;
  mock: MockBackend;
  close: () => Promise<void>;
}

/**
 * Boot the full stack in-process: mock backend + the real MCP app (on an
 * ephemeral port) + a connected MCP client. Env is set before the dynamic
 * import so config picks up the mock URL + test token (each test file runs in
 * its own process, so this is isolated).
 */
export async function startHarness(): Promise<Harness> {
  const mock = await startMockBackend();
  process.env.PENNYWISE_API_URL = mock.url;
  process.env.MCP_AUTH_TOKEN = TOKEN;

  const { createApp } = await import("../../src/index.js");
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );

  return {
    client,
    mock,
    close: async () => {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mock.close();
    },
  };
}
