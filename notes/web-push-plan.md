# Pennywise Web Push Implementation Plan

> For agentic workers: use `superpowers:executing-plans` to implement this plan task by task. Checkboxes track completion. This document is a plan, not an instruction to deploy.

**Goal:** Receive one useful notification on the owner's iPhone Home Screen app each morning at 08:00 Europe/London, showing yesterday's spending, remaining flexible budget, and bank-sync freshness.

**Architecture:** Add Web Push to the existing frontend and Express backend, reuse existing reporting functions, and store subscriptions plus minimal daily-send state in one table. A standalone backend command performs the daily run. Prepare scheduler configuration, but leave scheduler activation and production setup for later.

**Tech stack:** Vite/React, Express, Prisma/PostgreSQL, Web Push API, `web-push`, DigitalOcean App Platform.

**Spec:** The agreed scope and deployment decisions are recorded below, based on the two pasted proposals and follow-up conversation on 28 October 2026.

## Agreed scope and current state

- Single-user personal app; optimise for low maintenance.
- Backend is a public DigitalOcean app. No authentication middleware is present in `pennywise-backend/src/index.ts`.
- Frontend has a Vercel configuration; its actual hosting has not been confirmed.
- No manifest, service worker, push sender, or scheduler exists in the repository. Existing SVG assets can supply the icon design.
- `getReportableOutflows()` in `pennywise-backend/src/services/reporting/reportable-transactions.ts` supplies spending totals, including uncategorised transactions and edited amounts.
- `getBudgetOverview(month)` in `pennywise-backend/src/services/budget.ts` supplies `remainingFlexible`; budgets use stored pay-cycle dates, not necessarily calendar months.
- `syncAllConnections()` returns per-connection outcomes. Check those outcomes: resolving successfully does not mean every bank synced.
- The MCP service's authentication protects only MCP, not the public Express API.
- User will arrange scheduling later, possibly elsewhere. Write configuration and instructions; do not activate a cron job, deploy, or change DigitalOcean resources.
- User explicitly deferred security work. Do not add authentication, an owner-access gate, or a security approval step to this MVP.

## Global constraints

- One daily summary only. Defer thresholds, weekly summaries, advanced preferences, and general delivery tracking.
- One subscription table with minimal per-device daily-send state; no user model or notification framework.
- Reuse financial calculations. Explicitly calculate yesterday's Europe/London boundaries, including 23- and 25-hour days.
- Permission must follow an explicit button click; provide iPhone Home Screen installation guidance.
- Never embed a private VAPID key or an access secret in the frontend build. Never log subscription endpoints or encryption keys.
- No public scheduler endpoint is needed for the direct-command approach.

## Deferred security work

At the user's request, authentication and broader API security work are outside this implementation plan and are not blockers for implementation or verification. Keep the existing access model; do not introduce owner secrets, sessions, an access gateway, or changes to the MCP or bank OAuth flows.

Basic input validation and server-side handling of VAPID secrets remain part of implementing push correctly. The public API's access protection remains deferred, not resolved.

## Review focus

1. Subscription payloads must be valid, and test sends must target only the requesting device.
2. Repeated/concurrent jobs must not normally send twice; process crashes must have a documented policy.
3. Yesterday must use London dates through BST transitions, regardless of the host timezone.
4. One successful bank sync must not hide a failed or disconnected bank.
5. Denied permission, an expired subscription, or a failed registration request must not leave the UI claiming notifications are enabled.

## Stage 1 — Enable push and receive a test notification

**Files:**

- Create `pennywise-frontend/public/manifest.webmanifest`, `public/sw.js`, and PNG icons under `public/icons/`.
- Modify `pennywise-frontend/index.html`, `src/main.tsx`, and `vercel.json` if needed to serve the manifest and service worker as real assets rather than the SPA fallback.
- Create `pennywise-frontend/src/features/connections/components/notification-settings.tsx`; add it to the existing Connections page.
- Extend `pennywise-frontend/src/shared/lib/api.ts`.
- Create `pennywise-backend/src/routes/push.ts` and `src/services/push.ts`; register the routes in `src/index.ts`.
- Modify `pennywise-backend/prisma/schema.prisma`, add a migration, and update `package.json` and `.env.example`.

**Interfaces:** `GET /api/push/public-key`, `POST /api/push/subscriptions`, `DELETE /api/push/subscriptions`, and `POST /api/push/test`. Test sends target the requesting device, not all devices. Payload: `{ title, body, url, tag }`.

- [x] Add focused backend tests for valid subscription upsert, malformed subscriptions, device-specific test sends, and removal on push-service 404/410.
- [x] Add `web-push` and its TypeScript types. Configure persistent `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; generate keys once during setup.
- [x] Add `PushSubscription`: unique endpoint, encryption keys, creation/update timestamps, and the daily-send fields described in Stage 3. Do not reset send state when an existing subscription is registered again.
- [x] Implement endpoints using the existing access model, with Zod validation. Restrict outbound subscription URLs to supported push-service hosts using exact/suffix-boundary checks; reject credentials, non-HTTPS URLs, and arbitrary internal destinations. Defer authentication and rate-limiting work.
- [x] Add manifest and icons using the current visual identity. Register a service worker with push and notification-click handlers; no offline caching is needed. Only open same-origin notification destinations.
- [x] Add Enable, Disable, and Send Test controls. Handle unsupported browsers, missing iPhone installation, denied permission, existing subscriptions, and failed backend registration. Show enabled only when browser and backend registration both succeed.
- [x] On disable, remove server registration and unsubscribe in an order that permits retry if either step fails.
- [ ] Run the focused tests and both package builds (**local checks passed; iPhone step pending**). Verify a generic test notification on an installed iPhone app over HTTPS before moving to financial summaries.

## Stage 2 — Generate the daily summary

**Files:** create `pennywise-backend/src/services/notifications/daily-summary.ts` and `test/daily-summary.test.ts`. Reuse existing sync, reporting, and budget services.

**Interface:** `buildDailySummary(now: Date): Promise<{ title: string; body: string; url: string; tag: string }>`; this builds the payload after checking sync outcomes and stored freshness.

- [x] Write tests for London yesterday boundaries in winter, summer, and both DST transitions; ignored transactions, income, edited amounts, and uncategorised spending; active pay-cycle selection; missing budgets; and partial/failed syncs.
- [x] Derive yesterday's start and today's start in London. Pass the appropriate inclusive end to the existing reporting function, whose query uses `lte`. Sum its returned outflows without category filtering.
- [x] Find the budget whose stored cycle contains today's London date and reuse `getBudgetOverview()`. Do not assume its month key equals the calendar month. If absent or ambiguous, say the budget is unavailable rather than inventing a balance.
- [x] Sync before building the summary and inspect every outcome, including reconnect-required banks excluded from active sync. Treat any failed/incomplete sync or bank last synced over 24 hours ago as stale.
- [x] For fresh data, show yesterday's spending, remaining flexible budget, and the latest successful sync time. When data is incomplete/stale, send a short warning instead of potentially misleading financial totals, including the last successful sync date/time where available.
- [x] Verify existing outflow direction/edited-amount semantics against the tests; any necessary correction belongs in the shared reporting helper, not a notification-only calculation.
- [x] Run the focused tests and backend build.

Example fresh notification:

```text
Pennywise
Yesterday: £42.80 spent
Flexible budget: £215 remaining
Last bank sync: 07:54
```

## Stage 3 — Run once per device per London day

**Files:** create `pennywise-backend/src/scripts/send-daily-notifications.ts` and `test/daily-notifications.test.ts`; extend the notification service and backend package scripts.

**Interface:** `runDailyNotifications(now: Date): Promise<{ sent: number; skipped: number; expired: number; failed: number }>`; expose it through `npm run notifications:daily`, running `node dist/scripts/send-daily-notifications.js` after a build.

- [x] Add tests for repeat calls, concurrent claims, partial device success, expired subscriptions, transient failure, and crash/uncertain-send policy.
- [x] Keep `lastAttemptDate` and `lastSentDate` as nullable London `YYYY-MM-DD` keys on each subscription. Atomically claim a device/date before sending, conditional on it not already being claimed or sent that day.
- [x] Record success only after the push service accepts the notification. Remove subscriptions on 404/410. Log sanitised counts/errors, not payload contents or subscription secrets.
- [x] Prefer avoiding duplicates: retain the claim on ambiguous network failure or process crash, so that device may miss that day's summary. Release only when it is certain the message was not accepted. Never describe push-service acceptance as confirmed phone delivery.
- [x] Use a stable daily tag for presentation, but do not rely on tags for server-side duplicate prevention. Test notifications do not consume the daily claim.
- [x] Make the CLI finish cleanly, close database resources, and return a non-zero exit status for failures. A repeated run skips claimed/sent devices.
- [x] Run focused tests and backend build; exercise the command with mocked push delivery before any live financial send.

## Stage 4 — Prepare scheduler config; defer activation

**Files:** create `deploy/digitalocean/daily-notifications.example.yaml`; add setup notes to this document when implemented.

- [x] Write an app-spec fragment for a DigitalOcean job using the backend source directory, build command, and `npm run notifications:daily` run command.
- [x] Set `kind: SCHEDULED`, `schedule.cron: "0 8 * * *"`, and `schedule.time_zone: Europe/London`. Mark deployment branch and instance selection for confirmation against the existing app.
- [x] Document required job environment: database access, existing TrueLayer configuration, persistent VAPID keys, and any environment required by the imported backend modules. Configure secrets through the host, never commit their values.
- [x] Clearly label the file as a fragment to merge into the current app spec, not a replacement for the existing application.
- [x] Document that another scheduler can run the same command where backend dependencies, secrets, and database connectivity are available. An HTTP-only scheduler would require a separately protected endpoint; that is deferred.
- [x] Validate YAML and compare fields with the current DigitalOcean schema. Do not apply the spec, create a job, or activate a schedule.

DigitalOcean supports scheduled jobs and named timezones: [job setup](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/) and [app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).

## Verification and handoff

- Use Node's test runner with the existing `tsx` dependency for focused backend tests; add a `test` script rather than a large new test framework.
- Run backend and frontend `npm run build`; check frontend lint and distinguish existing failures from new ones.
- On a real iPhone: install from Safari, enable notifications, lock the phone, receive a test, tap to open Pennywise, disable, and confirm the device is removed.
- Test repeated and concurrent daily runs without real push delivery; validate a real financial summary once production settings are ready. Access-protection work is deferred and is not a prerequisite for this verification.
- Handoff must distinguish implemented code from manual deployment, database migration, secret configuration, iPhone verification, and scheduler activation still outstanding.

**Current status:** Implemented and locally verified. Production migration, deployment, persistent secret configuration, real iPhone verification and scheduler activation remain outstanding. See setup notes below.

## Implementation and setup notes — 28 October 2026

Implementation is on `codex/web-push`. No production database migration, deployment,
VAPID setup, live notification or scheduler activation has been performed.
The real iPhone test in Stage 1 remains a release gate; later stages were implemented
and tested locally with mocked delivery so no financial notification was sent.

### What was added

- A single `push_subscriptions` table and additive SQL migration.
- Validated, device-scoped subscription/test endpoints under `/api/push`.
- Connections notification controls, Home Screen manifest/icons, push worker and
  same-origin notification destinations; no offline caching.
- London daily summaries using shared reporting and the stored active pay cycle.
- `npm run notifications:daily`, atomic per-device claims, and an inactive example
  DigitalOcean job fragment at `deploy/digitalocean/daily-notifications.example.yaml`.
- Shared reporting now uses an edited amount's sign when classifying outflows.
  The shared budget overview now selects edited amounts too, keeping the
  remaining flexible balance consistent. Exhausted initial bank fetch windows now return a failed outcome rather than
  advancing the bank's stored freshness.

### Setup later (not executed)

1. Back up/review the production database change through the normal deployment
   process. This repository previously used `prisma db push` and has no migration
   baseline, so **do not run `prisma migrate deploy` on the existing database**.
   From `pennywise-backend`, run `npm ci --include=dev`, then apply only the
   reviewed additive SQL with
   `npx prisma db execute --file prisma/migrations/20261028080000_add_push_subscriptions/migration.sql`,
   then `npm run build`. Set `DATABASE_URL` to the intended database through the
   host. Run the SQL once; it creates only `push_subscriptions` and its unique
   index and leaves existing tables/data intact. The populated-database path is
   covered by the local integration test. A future switch to Prisma Migrate
   requires baselining the complete existing schema first. For a new empty local
   development database, the existing `npm run db:push` creates the whole schema.
2. Generate VAPID keys **once**, in a private terminal, with
   `npx web-push generate-vapid-keys`. Persist the same keys for the API and job:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a real contact `VAPID_SUBJECT`
   such as `mailto:owner@example.com`. Configure these on the host; do not paste
   them into source, logs, or frontend environment variables. Changing the key
   pair requires devices to unsubscribe and subscribe again.
3. Deploy frontend and backend when ready. Confirm the actual frontend host,
   HTTPS, `VITE_API_URL` and backend `FRONTEND_URL` CORS origin.
   Verify `/sw.js`, `/manifest.webmanifest`, and `/icons/*.png` return real assets
   with appropriate types rather than the SPA HTML fallback. Vercel exceptions
   and worker no-cache headers are included.
4. On iOS 16.4 or later, open the site in Safari → Share → Add to Home Screen.
   Open the installed app → Connections → Enable. Lock the phone, Send Test,
   receive it, tap it to open Pennywise, then Disable and verify its database row
   is removed. Retry Enable after a failed registration. Retry Disable after a
   failed deletion/unsubscribe; disabling intent is retained across reloads.
5. Only after the generic iPhone test works, run one real financial summary from
   the backend runtime: `npm run notifications:daily`. Confirm the figures and
   bank freshness on the phone. This is still a manual verification item.
6. If choosing DigitalOcean scheduling, merge the example fragment into the
   existing app spec, confirm repository/branch/instance, inherit the environment
   below, and activate it separately. The file is not a replacement app spec.
   Its `SCHEDULED`, `schedule.cron` and `schedule.time_zone` fields were checked
   against the [DigitalOcean app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
   and [job setup guide](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/).

### Job environment and behavior

The job needs `DATABASE_URL` (also available at build time for Prisma), the same
`TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, `TRUELAYER_REDIRECT_URI`,
`TRUELAYER_AUTH_URL` and `TRUELAYER_API_URL` as the API, and all three VAPID values.
The shared environment module defaults `PORT` and `FRONTEND_URL`; no listening
server is started. `OPENAI_API_KEY` is optional and unused by the daily job.
Keep dev dependencies installed because the existing logger uses `pino-pretty`.
Use `TZ=Europe/London` for the existing budget service's local-date calculations;
the new yesterday boundaries and daily claim keys are explicitly London-based
and independent of the process timezone. `LOG_LEVEL=fatal` suppresses existing
bank-sync detail logs; the CLI always emits only aggregate counts and generic
errors for the notification run.

Freshness requires a successful outcome for every bank, active status and a
stored sync within 24 hours. A missing, disconnected or failed bank results in a
warning without financial totals. A missing or overlapping budget cycle displays
“Flexible budget: unavailable”. Notifications expire at the push service after
one hour; phone display and delivery timing are not guaranteed.

`sent` counts push-service acceptance followed by success-state recording, not
confirmed phone delivery. Runs return non-zero on failures and close the database
connection. Claims are acquired with an atomic conditional update. Repeating or
concurrently running the command skips devices already claimed/sent on that
London day. A test notification does not use a daily claim.

A network timeout, ambiguous server response, process crash, or database failure
after sending retains the daily claim: the device may miss that day's summary.
Explicit client rejection (400/401/403/413/429) releases the claim for retry;
404/410 deletes the expired subscription. Do not manually clear an uncertain
claim unless accepting the risk of a duplicate. Re-registering an existing endpoint
preserves both daily fields. Tags group presentation; database claims prevent
normal duplicates. Disabling removes the row, so disabling and re-enabling the
same day can create a new device record and permit another summary.

Any other scheduler may run the same compiled command with these dependencies,
secrets and database connectivity, scheduled for 08:00 Europe/London. An HTTP-only
scheduler would need a separately protected endpoint, which remains deferred.
Authentication and broader public API security remain deferred as requested.

### Local verification

From `pennywise-backend`, `npm test` builds then runs focused Node/tsx tests,
including a subprocess exercise of the compiled CLI with mocked push delivery.
No tests contact a bank or live push service. From `pennywise-frontend`, run
`npm run build` and `npm run lint`; the initial lint baseline has six existing
errors and one warning outside the notification changes.

An additional PostgreSQL integration test recreates and populates the pre-feature
schema in an empty, disposable **local** database named `push_test`, applies the
additive SQL, checks existing bank data is preserved, and exercises 12 concurrent
daily runs plus re-registration. Set `PUSH_TEST_DATABASE_URL` to that disposable database
and run `npm run test:integration`. Never point this test at the app database.
This test was run successfully against a temporary PostgreSQL 17 container.

Final local results: 43 focused tests passed, including CLI subprocess tests;
PostgreSQL integration passed; both package builds passed. Changed frontend files
pass lint. Full frontend lint remains at the original six errors and one warning.
