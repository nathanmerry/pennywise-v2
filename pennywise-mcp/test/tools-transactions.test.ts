import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness, type Harness } from "./support/harness.js";

/** Full-path tests for add_transaction (name→id resolution, expense/income). */
describe("add_transaction tool", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const add = (args: Record<string, unknown>) => h.client.callTool({ name: "add_transaction", arguments: args });

  it("adds a basic expense (direction defaults to expense)", async () => {
    const r = await add({ description: "Cash lunch", amount: 12.5 });
    assert.notEqual(r.isError, true);
    const t = (r.structuredContent as any).transaction;
    assert.equal(t._method, "POST");
    assert.equal(t._path, "/api/transactions");
    assert.equal(t.description, "Cash lunch");
    assert.equal(t.amount, 12.5);
    assert.equal(t.direction, "expense");
  });

  it("resolves a category name → id", async () => {
    const t = (await add({ description: "Coffee", amount: 3, category: "Eating Out" })).structuredContent as any;
    assert.deepEqual(t.transaction.categoryIds, ["cat-eatingout"]);
  });

  it("resolves an account by name and passes the date", async () => {
    const t = (await add({ description: "Market", amount: 20, account: "Everyday", date: "2026-07-04" })).structuredContent as any;
    assert.equal(t.transaction.accountId, "acc-1");
    assert.equal(t.transaction.transactionDate, "2026-07-04");
  });

  it("supports income + note + ignore", async () => {
    const t = (await add({ description: "Refund", amount: 40, direction: "income", note: "reimbursed", ignore: true })).structuredContent as any;
    assert.equal(t.transaction.direction, "income");
    assert.equal(t.transaction.note, "reimbursed");
    assert.equal(t.transaction.isIgnored, true);
  });

  it("unknown category → friendly error listing options", async () => {
    const r = await add({ description: "x", amount: 1, category: "Nonsense" });
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /Top-level categories:/);
  });

  it("unknown account → friendly error listing accounts", async () => {
    const r = await add({ description: "x", amount: 1, account: "Nonsense" });
    assert.equal(r.isError, true);
    assert.match((r.content as Array<{ text: string }>)[0].text, /Available accounts:.*Everyday/);
  });
});
