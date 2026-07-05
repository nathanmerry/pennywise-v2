# pennywise-mcp

A small [MCP](https://modelcontextprotocol.io) server that lets ChatGPT (or any
MCP client) answer questions about your Pennywise spending — _"tell me about my
spending this month"_, _"what have I spent most on"_, _"any unusual transactions?"_.

It is a **thin, authenticated bridge**. It contains **no financial logic of its
own**: every number comes from the backend's existing `/api/budget/export/:month`
service, which reuses the exact calculations behind the Budget and Spending pages.
The bridge can never drift from what the app shows.

```
ChatGPT ──(MCP over HTTPS, bearer/token auth)──▶ pennywise-mcp ──(HTTP)──▶ Pennywise backend ──▶ DB
```

## Tools exposed

| Tool | Args | Returns |
| --- | --- | --- |
| `get_current_month_spending_summary` | – | Full snapshot of the **current pay cycle**: total spend, category breakdown, top merchants, the full transaction ledger (with notes + `ignored` flags), budget context, and plain-English `guidance`. |
| `get_spending_summary_for_month` | `month` (`YYYY-MM`) | The same snapshot for a **specific** month, e.g. `2026-06` for last month. |

Both return the backend's structured export verbatim, so ChatGPT has everything
it needs to give a conversational summary (biggest category, largest transaction,
excluded totals, patterns) without any extra calculation.

## Setup

```bash
cd pennywise-mcp
npm install
cp .env.example .env
# generate a strong shared secret and paste it into .env as MCP_AUTH_TOKEN:
openssl rand -hex 32
```

`.env`:

```
PENNYWISE_API_URL=http://localhost:3382   # your running backend
MCP_AUTH_TOKEN=<the long random secret>   # required; server refuses to start without it
MCP_PORT=3391
```

## Run locally

Start the backend first (in `../pennywise-backend`: `npm run dev`), then:

```bash
npm run dev      # tsx watch, hot reload
# or
npm run build && npm start
```

You should see: `pennywise-mcp listening on http://localhost:3391/mcp`.

## Verify it works

```bash
node smoke-test.mjs          # auth gate + protocol + tool listing (no backend needed)
node smoke-test.mjs --call   # also calls the current-month tool (backend must be running)
```

Or explore interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL:  http://localhost:3391/mcp
# Header: Authorization: Bearer <MCP_AUTH_TOKEN>
```

## Connect to ChatGPT

ChatGPT needs a **public HTTPS URL**. For a private MVP, tunnel your local server:

```bash
cloudflared tunnel --url http://localhost:3391   # or: ngrok http 3391
```

Then in ChatGPT: **Settings → Connectors → Advanced → Developer mode**, and add a
custom connector pointing at:

```
https://<your-tunnel-domain>/mcp?token=<MCP_AUTH_TOKEN>
```

The token is passed as a query param because ChatGPT's connector UI lets you paste
a URL but not a custom header. The server accepts the secret from **either** the
`?token=` query param **or** an `Authorization: Bearer` header, so header-capable
clients (the Inspector, Claude Desktop, curl) can use the header instead.

Once added, ask ChatGPT: _"Tell me about my spending this month."_ It will call
`get_current_month_spending_summary` and summarise the result.

> Keep the tunnel URL + token private — anyone with both can read your spending
> data. When you outgrow the shared-secret model, the clean upgrade is OAuth on
> the `/mcp` endpoint (ChatGPT's connector flow supports it); the tool code stays
> the same.

## Deploy (when ready)

Host `pennywise-mcp` behind real HTTPS (same box as the backend is simplest — set
`PENNYWISE_API_URL` to the backend's internal URL). `npm run build && npm start`.
The MCP server is the authenticated front door; the backend stays private behind it.

## Security notes

- The server **refuses to start** without `MCP_AUTH_TOKEN` (≥24 chars) — the
  endpoint is never unauthenticated in front of financial data.
- Token comparison is constant-time.
- Only the minimum data needed is exposed (the month export), and the bridge does
  **not** log transaction contents — only high-level request errors.

## Extending

Add a tool in [`src/mcp-server.ts`](src/mcp-server.ts) with `server.registerTool(...)`,
backed by a call in [`src/pennywise-client.ts`](src/pennywise-client.ts) to an
existing backend endpoint (e.g. `/api/budget/analysis` for arbitrary date ranges,
`/api/transactions` for a raw ledger). Keep all calculation in the backend.
