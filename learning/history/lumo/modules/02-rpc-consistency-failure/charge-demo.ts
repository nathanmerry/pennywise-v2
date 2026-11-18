// checkout charging the card, with a timeout + bounded retry + backoff.
//
//   npm run charge:naive   -> retries WITHOUT an idempotency key
//   npm run charge:safe    -> retries WITH the same idempotency key
//
// payment-svc must be running slow, so every attempt times out (partial failure):
//   PAYMENT_DELAY_MS=2000 npm run payment
//
// Watch the LEDGER at the end. Same brutal conditions, one field of difference.

const PAYMENT_URL = "http://localhost:4003";
const useKey = process.argv.includes("--idempotent");

const customerId = "cust-001";
const amountCents = 3200;
const TIMEOUT_MS = 500;
const MAX_ATTEMPTS = 3;

// ONE key per checkout attempt, REUSED across retries of that same attempt.
const idempotencyKey = useKey ? "checkout-cust-001-2026-07-attempt-1" : undefined;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chargeOnce(attempt: number) {
  const t0 = Date.now();
  console.log(`[checkout] charge attempt ${attempt}${useKey ? ` (key ${idempotencyKey})` : " (NO key)"} ...`);
  const resp = await fetch(`${PAYMENT_URL}/charge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId, amountCents, idempotencyKey }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await resp.json();
  console.log(`[checkout]   <- ack in ${Date.now() - t0}ms`, body);
  return body;
}

async function chargeWithRetry() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await chargeOnce(attempt);
      console.log(`[checkout] ✅ acknowledged on attempt ${attempt}`);
      return;
    } catch (err: any) {
      const why = err?.name === "TimeoutError" ? "TIMED OUT — silence, did the charge happen??" : (err?.cause?.code ?? err.message);
      console.log(`[checkout]   attempt ${attempt} failed: ${why}`);
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 200 * attempt; // real world: exponential + jitter
        console.log(`[checkout]   backing off ${backoff}ms, retrying...`);
        await delay(backoff);
      }
    }
  }
  console.log(`[checkout] ❌ gave up after ${MAX_ATTEMPTS} attempts (from the client's view, it "failed")`);
}

// fresh ledger each run
await fetch(`${PAYMENT_URL}/reset`, { method: "POST" });

await chargeWithRetry();

// The truth, from the payment service's side:
const ledger = await (await fetch(`${PAYMENT_URL}/ledger`)).json();
console.log(`\n[LEDGER] the customer was charged ${ledger.count} time(s), total $${(ledger.total / 100).toFixed(2)}`);
if (ledger.count > 1) {
  console.log(`[LEDGER] 🚨 DOUBLE-CHARGED. And from checkout's view the payment "failed". This is the Reddit front page.`);
} else {
  console.log(`[LEDGER] ✅ charged exactly once — even though checkout saw nothing but timeouts. That's idempotency.`);
}
