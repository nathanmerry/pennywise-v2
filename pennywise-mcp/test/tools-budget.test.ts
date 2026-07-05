import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness, type Harness } from "./support/harness.js";

/** Full-path tests for the budget write tools (name→id resolution, create vs update). */
describe("budget write tools", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (name: string, args: Record<string, unknown>) => h.client.callTool({ name, arguments: args });

  it("set_category_budget UPDATES an existing category plan (defaults to current month)", async () => {
    const sc = (await call("set_category_budget", { category: "Eating Out", amount: 300 })).structuredContent as any;
    assert.equal(sc.action, "updated");
    assert.equal(sc.result._method, "PATCH");
    assert.equal(sc.result._path, "/api/budget/plans/plan-eatingout");
    assert.equal(sc.result.targetValue, 300);
  });

  it("set_category_budget CREATES a new plan, resolving category name → id", async () => {
    const sc = (await call("set_category_budget", { category: "Groceries", amount: 200 })).structuredContent as any;
    assert.equal(sc.action, "created");
    assert.equal(sc.result._method, "POST");
    assert.equal(sc.result._path, "/api/budget/months/2026-07/plans");
    assert.equal(sc.result.categoryId, "cat-groceries");
    assert.equal(sc.result.targetValue, 200);
  });

  it("set_category_budget updates a GROUP budget by name", async () => {
    const sc = (await call("set_category_budget", { category: "Essentials", amount: 600 })).structuredContent as any;
    assert.equal(sc.action, "updated");
    assert.equal(sc.result._path, "/api/budget/plans/plan-essentials");
  });

  it("set_category_budget supports percent targets", async () => {
    const sc = (await call("set_category_budget", { category: "Groceries", amount: 15, type: "percent" })).structuredContent as any;
    assert.equal(sc.result.targetType, "percent");
  });

  it("set_category_budget on an unknown name lists available options", async () => {
    const r = await call("set_category_budget", { category: "Nonsense", amount: 10 });
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /Top-level categories:.*Groceries/);
  });

  it("update_budget_month sets income + savings target", async () => {
    const sc = (await call("update_budget_month", {
      expectedIncome: 3500,
      savingsTargetType: "percent",
      savingsTargetValue: 20,
    })).structuredContent as any;
    assert.equal(sc.action, "updated");
    assert.equal(sc.result._method, "PATCH");
    assert.equal(sc.result._path, "/api/budget/months/2026-07");
    assert.equal(sc.result.expectedIncome, 3500);
  });

  it("update_budget_month with no fields is a friendly error", async () => {
    const r = await call("update_budget_month", {});
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /Nothing to update/);
  });

  it("add_planned_spend UPDATES an existing one by name", async () => {
    const sc = (await call("add_planned_spend", { name: "Flights", amount: 400 })).structuredContent as any;
    assert.equal(sc.action, "updated");
    assert.equal(sc.result._path, "/api/budget/planned/planned-1");
  });

  it("add_planned_spend CREATES a new one, resolving category + date", async () => {
    const sc = (await call("add_planned_spend", {
      name: "Concert",
      amount: 80,
      category: "Eating Out",
      plannedDate: "2026-07-20",
    })).structuredContent as any;
    assert.equal(sc.action, "created");
    assert.equal(sc.result._path, "/api/budget/months/2026-07/planned");
    assert.equal(sc.result.categoryId, "cat-eatingout");
    assert.match(sc.result.plannedDate, /^2026-07-20T/);
  });

  it("add_fixed_commitment UPDATES an existing one by name", async () => {
    const sc = (await call("add_fixed_commitment", { name: "Rent", amount: 1200 })).structuredContent as any;
    assert.equal(sc.result._path, "/api/budget/commitments/commit-1");
  });

  it("writing to a month with no budget gives a friendly error", async () => {
    const r = await call("set_category_budget", { category: "Groceries", amount: 100, month: "2099-01" });
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /No budget is set up for 2099-01/);
  });
});
