import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROMPT_TITLE_CHARS, truncatePromptTitle, truncateTitle } from "./hash.js";

describe("truncatePromptTitle", () => {
  it("returns null for empty input", () => {
    assert.equal(truncatePromptTitle(null), null);
    assert.equal(truncatePromptTitle("   "), null);
  });

  it("collapses whitespace and keeps short titles", () => {
    assert.equal(truncatePromptTitle("  hello   navigator  "), "hello navigator");
  });

  it("cuts to 30–50 characters (default 40) and does not keep the full body", () => {
    const body = "User prompt 042: navigate the long thread index without copying conversation body. Extra words follow.";
    const title = truncatePromptTitle(body);
    assert.ok(title);
    assert.ok(title!.endsWith("…"));
    assert.equal(title!.length, PROMPT_TITLE_CHARS);
    assert.ok(!title!.includes("Extra words follow"));
    assert.notEqual(title, body);
  });

  it("does not exceed the 50-char product cap", () => {
    const body = "x".repeat(200);
    const title = truncatePromptTitle(body, 80);
    assert.equal(title!.length, 50);
  });
});

describe("truncateTitle", () => {
  it("uses the persistence budget of 120", () => {
    const raw = "word ".repeat(40).trim();
    const title = truncateTitle(raw);
    assert.ok(title!.length <= 120);
  });
});
