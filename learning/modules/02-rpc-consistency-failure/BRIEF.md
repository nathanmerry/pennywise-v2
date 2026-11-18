# A manual expense with no response

A user asks MCP to add a £12.50 cash lunch. The HTTP request fails before the caller receives a response. The caller must decide what to do next.

## Observed code

- `pennywise-mcp/src/pennywise-client.ts`: `createTransaction` calls `apiSend` with POST `/api/transactions`; fetch rejection becomes `PennywiseApiError` with status 0. No explicit retry or request deadline in this helper.
- `pennywise-backend/src/routes/transactions.ts:104`: validates input, creates a transaction, applies categories/rules, and returns the result. Each invocation generates a fresh manual source transaction UUID.
- `pennywise-backend/prisma/schema.prisma:46`: Transaction has a generated primary key and a unique (source, sourceTransactionId) constraint.
- `pennywise-mcp/test/client-down.test.ts`: covers an unreachable backend for a read.
- `pennywise-mcp/test/client.test.ts` and `pennywise-mcp/test/tools-transactions.test.ts`: existing client and transaction-tool test locations for a later focused experiment.

## Scenario status

The lost response is hypothetical, not an observed production incident. The caller has no HTTP response; the server outcome is deliberately unspecified for Nathan to reason about.

## Infrastructure context

AWS integration is starting, as reported by Nathan. Inspected local PostgreSQL Docker Compose and the DigitalOcean daily-notifications example fragment. Neither establishes deployed AWS resources. No AWS topology is assumed or required for this opening problem.

## Source coverage

M02: abstractions-in-system-design; network-abstractions-remote-procedure-calls; spectrum-of-consistency-models; the-spectrum-of-failure-models.
Read the available entries in learning/lessons/all-lessons.json. These entries contain abbreviated excerpts (including ellipses), so they are not complete lesson transcripts. Cover network boundaries, consistency guarantees and failure models through subsequent discussion; do not infer completion from the opening exercise.

## Opening question

The MCP call to add a £12.50 cash lunch fails before receiving an HTTP response. What would you have the caller do next, and why?
