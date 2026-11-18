// The renewal job. Priya pauses; a beat later the renewal runs and decides whether to charge.
//
//   npm run renewal:stale       -> renewal reads from the REPLICA (default, scales reads)
//   npm run renewal:consistent  -> renewal reads from the PRIMARY (?from=primary)
//
// subscription-svc must be running with a replication lag wide enough to lose the race:
//   REPLICATION_LAG_MS=1000 npm run sub

const SUB_URL = "http://localhost:4004";
const consistent = process.argv.includes("--consistent");
const id = "sub-priya";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// clean slate: subscription starts active
await fetch(`${SUB_URL}/subscriptions/${id}/reset`, { method: "POST" });

// 10:00:00 — Priya taps Pause on her phone. The write hits the PRIMARY.
console.log(`[priya]    taps PAUSE`);
await fetch(`${SUB_URL}/subscriptions/${id}/pause`, { method: "POST" });

// 10:00:01 — the renewal job runs a beat later — WELL within the replication lag window.
await delay(100);
const from = consistent ? "primary" : "replica";
console.log(`[renewal]  running renewal, reading subscription from the ${from}...`);
const sub = await (await fetch(`${SUB_URL}/subscriptions/${id}?from=${from}`)).json();
console.log(`[renewal]  saw status='${sub.status}' (from ${sub.readFrom})`);

if (sub.status === "active") {
  console.log(`[renewal]  💳 CHARGING Priya £32.00`);
  console.log(`[renewal]  🚨 ...but she PAUSED one second ago. Wrong charge. She's back on Reddit.\n`);
} else {
  console.log(`[renewal]  ⏭️  status is 'paused' — skip the charge. ✅ correct.\n`);
}
