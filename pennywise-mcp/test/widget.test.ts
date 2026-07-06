import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness, type Harness } from "./support/harness.js";

const TEMPLATE_URI = "ui://widget/pennywise-budget-pace-v2.html";

/** Verifies the ChatGPT Apps SDK wiring: template resource + tool→template link. */
describe("budget pace widget (Apps SDK)", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await h.close();
  });

  it("registers the widget template as a text/html+skybridge resource", async () => {
    const { resources } = await h.client.listResources();
    const r = resources.find((x) => x.uri === TEMPLATE_URI);
    assert.ok(r, "widget resource should be listed");
    assert.equal(r.mimeType, "text/html+skybridge");
  });

  it("serves a self-contained HTML doc that reads window.openai.toolOutput", async () => {
    const read = await h.client.readResource({ uri: TEMPLATE_URI });
    const doc = read.contents[0];
    assert.equal(doc.mimeType, "text/html+skybridge");
    const text = String(doc.text);
    assert.match(text, /<!doctype html>/i);
    assert.match(text, /window\.openai/); // reads host globals
    assert.match(text, /openai:set_globals/); // subscribes to updates
    assert.doesNotMatch(text, /https?:\/\/[^"']*\.(js|css)/i); // no external script/style
  });

  it("get_budget_pace links to the template via openai/outputTemplate", async () => {
    const { tools } = await h.client.listTools();
    const pace = tools.find((t) => t.name === "get_budget_pace");
    assert.ok(pace, "get_budget_pace should exist");
    const meta = pace._meta as Record<string, unknown> | undefined;
    assert.equal(meta?.["openai/outputTemplate"], TEMPLATE_URI);
  });
});
