import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToken, tokensMatch } from "../src/auth.js";

test("extractToken: reads a Bearer header", () => {
  assert.equal(extractToken({ headers: { authorization: "Bearer abc123" }, query: {} }), "abc123");
});

test("extractToken: reads a ?token= query param", () => {
  assert.equal(extractToken({ headers: {}, query: { token: "xyz" } }), "xyz");
});

test("extractToken: header takes precedence over query", () => {
  assert.equal(
    extractToken({ headers: { authorization: "Bearer h" }, query: { token: "q" } }),
    "h",
  );
});

test("extractToken: returns null when neither is present", () => {
  assert.equal(extractToken({ headers: {}, query: {} }), null);
});

test("extractToken: treats an empty Bearer token as missing", () => {
  assert.equal(extractToken({ headers: { authorization: "Bearer    " }, query: {} }), null);
});

test("tokensMatch: true for identical tokens", () => {
  assert.equal(tokensMatch("secret-token-value", "secret-token-value"), true);
});

test("tokensMatch: false for different tokens of equal length", () => {
  assert.equal(tokensMatch("aaaaaa", "bbbbbb"), false);
});

test("tokensMatch: false for different lengths (no throw)", () => {
  assert.equal(tokensMatch("short", "a-much-longer-token"), false);
});
