# Testing the Pennywise MCP integration

This maps OpenAI's connector testing guidance (tool correctness, component UX,
discovery precision) onto this MVP. There is no widget/component, so "component
UX" is out of scope; the focus is **tool correctness** and **discovery precision**.

## 1. Automated tests (`npm test`)

Runs on Node's built-in test runner via `tsx` (no extra deps). 28 tests across:

| File | Covers |
| --- | --- |
| `test/auth.test.ts` | Token extraction (Bearer header, `?token=`, precedence, empty/missing) and constant-time comparison (equal / unequal / length-mismatch). |
| `test/export-schema.test.ts` | `outputSchema` validates populated + empty exports, tolerates unknown fields (passthrough), rejects wrong-typed known fields, accepts nullable category fields. |
| `test/client.test.ts` | Backend client: resolves current month, fetches a month, raises `PennywiseApiError(404)` for a missing month (against an in-process mock backend). |
| `test/client-down.test.ts` | Backend unreachable → `PennywiseApiError(0)` with a helpful message. |
| `test/tools.test.ts` | Full path (real MCP client → auth → tools → mock backend): rejects bad tokens; lists both tools each advertising an `outputSchema`; current-month returns `structuredContent` with the **full** ledger (proves validation doesn't strip data); specific/empty/missing/bad-format months. Plus raw-HTTP checks: unauthenticated → 401 "missing credentials", wrong token → 401 "invalid token", `/health` open, `GET /mcp` without a session → 404. |

Representative fixtures live in `test/support/` next to the tests so they track the
schema as it evolves. Run a single file with
`node --import tsx --test test/tools.test.ts`.

## 2. MCP Inspector (interactive, local)

```bash
npm run dev                                   # start the bridge
npx @modelcontextprotocol/inspector@latest    # in another terminal
```

- Transport: **Streamable HTTP**, URL `http://localhost:3391/mcp`
- Auth: add header `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **List Tools** → confirm both tools + their input/output schemas render.
- **Call Tool** → run each and inspect the raw request/response and `structuredContent`.

## 3. Quick smoke test (scripted)

```bash
node smoke-test.mjs          # auth gate + protocol + tool listing (no backend needed)
node smoke-test.mjs --call   # also calls the current-month tool (backend must be running)
```

## 4. ChatGPT developer mode — golden prompt set

After the connector is reachable over HTTPS (see [README](README.md)), enable it in
a new chat and run this set. Record which tool was selected and the arguments passed.

### Direct — should call a tool

| Prompt | Expected tool | Expected args |
| --- | --- | --- |
| "Tell me about my spending this month." | `get_current_month_spending_summary` | – |
| "What have I spent the most money on this month?" | `get_current_month_spending_summary` | – |
| "How much have I spent on eating out this month?" | `get_current_month_spending_summary` | – |
| "Are there any unusual transactions this month?" | `get_current_month_spending_summary` | – |
| "Give me a quick summary of my spending so far this month." | `get_current_month_spending_summary` | – |
| "How did last month look?" / "Summarise June's spending." | `get_spending_summary_for_month` | `month` = prior month (`YYYY-MM`) |
| "What did I spend in 2026-06?" | `get_spending_summary_for_month` | `month` = `2026-06` |

### Indirect — should still trigger

| Prompt | Expected |
| --- | --- |
| "I feel like I've been overspending lately — can you check?" | current-month summary, then reasons over it |
| "Where is my money going?" | current-month summary |
| "Am I eating out too much?" | current-month summary, focuses on the Eating Out category |

### Negative — should NOT call a tool

| Prompt | Expected |
| --- | --- |
| "What's the capital of France?" | plain answer, no tool call |
| "Write me a poem about money." | plain answer, no tool call |
| "How do budgets work in general?" | generic answer; only calls a tool if the user references *their* data |
| "What's the weather today?" | plain answer, no tool call |

**What good looks like:** direct + indirect prompts select the right tool with a
valid `month` (the model infers relative months from the current date); negative
prompts answer without touching the connector. Note anywhere the model picks the
wrong tool or an invalid `month` — tighten the tool `description` if so.

## 5. API Playground (raw request/response logs)

[platform.openai.com/playground](https://platform.openai.com/playground) → **Tools →
Add → MCP Server** → your HTTPS `/mcp?token=…` URL. Issue the golden prompts and
inspect the JSON tool-call request/response pairs — useful when you need raw logs
without the ChatGPT UI.

## Regression checklist (per OpenAI's guidance)

| Item | Status |
| --- | --- |
| Tool list matches docs; no unused prototypes | ✅ Two tools, both in [README](README.md); asserted in `tools.test.ts`. |
| Structured content matches the declared `outputSchema` for every tool | ✅ Both tools declare `outputSchema` and return `structuredContent`; validated in `export-schema.test.ts` + `tools.test.ts`. |
| Widgets render without console errors | ➖ N/A — no UI component in this MVP. |
| Auth returns valid access and rejects invalid with meaningful messages | ✅ Distinct "missing credentials" vs "invalid token" 401s, both asserted end-to-end against the running app in `tools.test.ts` (plus pure-helper coverage in `auth.test.ts`). |
| Discovery behaves across golden prompts, not on negatives | ⏳ Manual — run §4 in ChatGPT dev mode before relying on it. |

Capture §4 results in a doc per release so discovery quality can be compared over time.
