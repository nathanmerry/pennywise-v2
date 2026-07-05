import { test } from "node:test";
import assert from "node:assert/strict";
import { spendingExportSchema } from "../src/export-schema.js";
import { makeExport } from "./support/fixtures.js";

test("validates a populated export", () => {
  const result = spendingExportSchema.safeParse(makeExport("2026-07"));
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues, null, 2));
});

test("validates a valid-but-empty month", () => {
  const result = spendingExportSchema.safeParse(makeExport("2026-05", { empty: true }));
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues, null, 2));
});

test("tolerates unknown/added fields (schema is passthrough, must not break)", () => {
  const withExtras = {
    ...makeExport("2026-07"),
    somethingTheBackendAddedLater: { nested: true },
  };
  const result = spendingExportSchema.safeParse(withExtras);
  assert.ok(result.success, "tolerant schema should accept unknown fields");
});

test("rejects a known field with the wrong type", () => {
  const bad = makeExport("2026-07");
  (bad.summary as Record<string, unknown>).actualSpend = "not-a-number";
  const result = spendingExportSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test("accepts null budget/remaining/percentUsed on a category (nullable fields)", () => {
  const exp = makeExport("2026-07");
  const cats = (exp.spending as { byCategory: Array<Record<string, unknown>> }).byCategory;
  assert.ok(
    cats.some((c) => c.budget === null),
    "fixture should include a category with null budget",
  );
  assert.ok(spendingExportSchema.safeParse(exp).success);
});
