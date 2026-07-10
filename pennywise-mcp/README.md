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

**Read — whole-month snapshots**

| Tool | Args | Returns |
| --- | --- | --- |
| `get_current_month_spending_summary` | – | Full snapshot of the **current pay cycle**: total spend, category breakdown, top merchants, the full transaction ledger (with notes + `ignored` flags), budget context, and plain-English `guidance`. |
| `get_spending_summary_for_month` | `month` (`YYYY-MM`) | The same snapshot for a **specific** month, e.g. `2026-06` for last month. |

**Read — range / cycle / week analysis** (mirrors the `/spending` page)

| Tool | Args | Returns |
| --- | --- | --- |
| `get_spending_analysis` | `range` (`this_cycle`\|`last_cycle`\|`last_3_cycles`\|`last_6_cycles`\|`ytd`\|`custom`), optional `start`/`end`, `week` (1–6), `compare`, `includeIgnored` | Category breakdown (share, counts, trend), day-by-day series, top merchants, over a preset/custom/weekly range. |
| `get_category_drilldown` | `categoryId` + same range args | One category's transactions, top merchants, series, monthly history, recurring vs one-off, weekday/weekend. |
| `get_budget_pace` | optional `month` | **Chart-ready** pace: `spentPct` (flexible budget spent) vs `elapsedPct` (cycle elapsed), overall + per category. Feed straight to ChatGPT's data-analysis to plot a spend-vs-time chart. |

**Write — budget "core knobs"** (create/update only, no deletes; flagged so ChatGPT confirms first)

| Tool | Args | Effect |
| --- | --- | --- |
| `set_category_budget` | `category` (name), `amount`, optional `type` (`fixed`\|`percent`), `month` | Create/adjust a category or group budget target. |
| `update_budget_month` | optional `month`, `expectedIncome`, `savingsTargetType`, `savingsTargetValue` | Update month income / savings target. |
| `add_planned_spend` | `name`, `amount`, optional `month`, `plannedDate`, `category`, `budgetGroup`, `isEssential` | Add/update a planned one-off. |
| `add_fixed_commitment` | `name`, `amount`, optional `month`, `dueDate`, `category` | Add/update a fixed commitment. |

**Write — transactions**

| Tool | Args | Effect |
| --- | --- | --- |
| `add_transaction` | `description`, `amount` (positive), optional `direction` (`expense`\|`income`), `date`, `category`, `account`, `merchant`, `note`, `ignore` | Record a manual transaction (e.g. cash spend). Amount is entered positive; the backend stores expense as negative to match the reporting convention. |

### Inline chart widget (ChatGPT Apps SDK)

`get_budget_pace` also ships an **inline chart** that ChatGPT renders in the
conversation — a horizontal "budget spent" bar with a *pace* marker (how far
through the cycle you are), plus per-category bars, theme-aware for light/dark.

It's wired the Apps SDK way: the MCP registers the HTML template as a
`ui://widget/pennywise-budget-pace.html` resource (mime `text/html+skybridge`,
[src/widgets/budget-pace.html](src/widgets/budget-pace.html), fully self-contained
— all CSS/JS inline for the sandbox CSP), and the tool references it via
`_meta["openai/outputTemplate"]`. The component reads the tool's `structuredContent`
from `window.openai.toolOutput`. Preview it locally in the MCP Inspector (it renders
components inline); the full styled render only appears in ChatGPT.

Read tools return the backend's structured payload verbatim (as `structuredContent`
validated against a declared `outputSchema`) — no calculation is duplicated in the
bridge; the analysis tools only replicate the UI's date-range/week resolution. Write
tools resolve category/group **names → ids** server-side, choose create-vs-update
automatically, and are annotated `readOnlyHint: false` so ChatGPT surfaces a
confirmation before running them. Deleting and structural changes (new/removed
months, groups, events) and bank **sync** are intentionally not exposed.

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
npm test                     # 28 automated tests (auth, schema, client, full tool path)
node smoke-test.mjs          # auth gate + protocol + tool listing (no backend needed)
node smoke-test.mjs --call   # also calls the current-month tool (backend must be running)
```

See [TESTING.md](TESTING.md) for the full test strategy, the ChatGPT golden-prompt
set, and the launch regression checklist.

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
