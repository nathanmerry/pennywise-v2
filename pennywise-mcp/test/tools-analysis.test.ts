import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness, type Harness } from "./support/harness.js";

/** Full-path tests for the spending-analysis tools (range resolution → backend). */
describe("spending analysis tools", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyse = (args: Record<string, unknown>) =>
    h.client.callTool({ name: "get_spending_analysis", arguments: args });

  it("this_cycle resolves to the current cycle window", async () => {
    const r = await analyse({ range: "this_cycle" });
    const sc = r.structuredContent as any;
    assert.equal(sc.resolvedRange.start, "2026-07-01");
    assert.equal(sc.resolvedRange.end, "2026-07-28");
    assert.equal(sc._received.preset, "this_cycle");
  });

  it("last_3_cycles spans cycle 2-back start → current end", async () => {
    const sc = (await analyse({ range: "last_3_cycles" })).structuredContent as any;
    assert.equal(sc.resolvedRange.start, "2026-05-01");
    assert.equal(sc.resolvedRange.end, "2026-07-28");
  });

  it("week 2 of this_cycle is the second 7-day slice and sends preset=custom", async () => {
    const sc = (await analyse({ range: "this_cycle", week: 2 })).structuredContent as any;
    assert.equal(sc.resolvedRange.start, "2026-07-08");
    assert.equal(sc.resolvedRange.end, "2026-07-14");
    assert.equal(sc.resolvedRange.week, 2);
    assert.equal(sc._received.preset, "custom");
  });

  it("custom passes through; missing dates is a friendly error", async () => {
    const ok = await analyse({ range: "custom", start: "2026-01-01", end: "2026-01-31" });
    assert.equal((ok.structuredContent as any).resolvedRange.start, "2026-01-01");
    const bad = await analyse({ range: "custom" });
    assert.equal(bad.isError, true);
    assert.match((bad.content as Array<{ text: string }>)[0].text, /custom range requires/i);
  });

  it("week on a multi-cycle preset errors", async () => {
    const r = await analyse({ range: "last_3_cycles", week: 1 });
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /only available for/i);
  });

  it("compare + includeIgnored flags are forwarded", async () => {
    const sc = (await analyse({ range: "this_cycle", compare: true, includeIgnored: true })).structuredContent as any;
    assert.equal(sc._received.compare, "true");
    assert.equal(sc._received.includeIgnored, "true");
  });

  it("drilldown returns the category detail", async () => {
    const r = await h.client.callTool({
      name: "get_category_drilldown",
      arguments: { categoryId: "cat-eatingout", range: "this_cycle" },
    });
    assert.notEqual(r.isError, true);
    assert.equal((r.structuredContent as any).category.categoryId, "cat-eatingout");
  });
});
