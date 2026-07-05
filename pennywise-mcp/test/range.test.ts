import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRange, buildCycleWeeks } from "../src/range.js";

const cycles = ["2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"].map((m) => ({
  budgetMonth: m,
  startInclusive: `${m}-01T12:00:00.000Z`,
  endExclusive: `${m}-29T12:00:00.000Z`,
  cycleStartDate: `${m}-01T12:00:00.000Z`,
  cycleEndDate: `${m}-28T12:00:00.000Z`,
  daysInCycle: 28,
}));

test("this_cycle → current cycle window", () => {
  const r = resolveRange({ preset: "this_cycle" }, cycles);
  assert.deepEqual([r.start, r.end, r.preset], ["2026-07-01", "2026-07-28", "this_cycle"]);
});

test("last_cycle → previous cycle window", () => {
  const r = resolveRange({ preset: "last_cycle" }, cycles);
  assert.deepEqual([r.start, r.end], ["2026-06-01", "2026-06-28"]);
});

test("last_3_cycles → cycle 2-back start to current end", () => {
  const r = resolveRange({ preset: "last_3_cycles" }, cycles);
  assert.deepEqual([r.start, r.end], ["2026-05-01", "2026-07-28"]);
});

test("last_6_cycles → oldest start to current end", () => {
  const r = resolveRange({ preset: "last_6_cycles" }, cycles);
  assert.deepEqual([r.start, r.end], ["2026-02-01", "2026-07-28"]);
});

test("ytd → Jan 1 of the current year", () => {
  const r = resolveRange({ preset: "ytd" }, cycles);
  assert.match(r.start, /^\d{4}-01-01$/);
});

test("custom requires both start and end", () => {
  assert.throws(() => resolveRange({ preset: "custom", start: "2026-01-01" }, cycles), /requires both/);
});

test("custom passes dates through", () => {
  const r = resolveRange({ preset: "custom", start: "2026-01-01", end: "2026-01-31" }, cycles);
  assert.deepEqual([r.start, r.end, r.preset], ["2026-01-01", "2026-01-31", "custom"]);
});

test("week 1 of this_cycle → first 7 days, preset forced to custom", () => {
  const r = resolveRange({ preset: "this_cycle", week: 1 }, cycles);
  assert.deepEqual([r.start, r.end, r.preset, r.week], ["2026-07-01", "2026-07-07", "custom", 1]);
});

test("week 4 of this_cycle → last full week", () => {
  const r = resolveRange({ preset: "this_cycle", week: 4 }, cycles);
  assert.deepEqual([r.start, r.end], ["2026-07-22", "2026-07-28"]);
});

test("week out of range throws", () => {
  assert.throws(() => resolveRange({ preset: "this_cycle", week: 6 }, cycles), /out of range/);
});

test("week on a multi-cycle preset throws", () => {
  assert.throws(() => resolveRange({ preset: "last_3_cycles", week: 1 }, cycles), /only available/);
});

test("not enough cycles throws", () => {
  assert.throws(() => resolveRange({ preset: "last_6_cycles" }, cycles.slice(0, 3)), /Not enough/);
});

test("buildCycleWeeks makes 4 inclusive weeks for a 28-day cycle", () => {
  const w = buildCycleWeeks("2026-07-01", "2026-07-28");
  assert.equal(w.length, 4);
  assert.deepEqual(w[0], { start: "2026-07-01", end: "2026-07-07" });
  assert.deepEqual(w[3], { start: "2026-07-22", end: "2026-07-28" });
});
