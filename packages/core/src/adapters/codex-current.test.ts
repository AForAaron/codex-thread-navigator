import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodexCurrentAdapter, parseThreadIdFromPath } from "./codex-current.js";

describe("parseThreadIdFromPath", () => {
  it("extracts conversation id from Explodex-documented route", () => {
    assert.equal(parseThreadIdFromPath("/thread/abc-123"), "abc-123");
    assert.equal(parseThreadIdFromPath("/thread/abc-123?x=1"), "abc-123");
    assert.equal(parseThreadIdFromPath("/settings/general-settings"), null);
  });
});

describe("CodexCurrentAdapter", () => {
  it("does not invent prompts when no nodes match", async () => {
    const adapter = new CodexCurrentAdapter(
      {
        querySelectorAll: () => [],
        querySelector: () => null,
      },
      { pathname: "/thread/t1", href: "https://codex.local/thread/t1" },
    );
    const thread = adapter.getCurrentThreadId();
    assert.equal(thread.ok, true);
    if (thread.ok) assert.equal(thread.value, "t1");
    const prompts = await adapter.listUserPrompts();
    assert.equal(prompts.ok, false);
    if (!prompts.ok) assert.equal(prompts.code, "SELECTOR_UNVERIFIED");
    const jump = adapter.jumpToLatest();
    assert.equal(jump.ok, false);
  });

  it("jumps only to nodes discovered by the real scan", async () => {
    const node = {
      textContent: "hello navigator",
      getAttribute: (name: string) => (name === "data-turn-id" ? "turn-9" : null),
      scrollIntoViewCalls: 0,
      scrollIntoView() {
        this.scrollIntoViewCalls += 1;
      },
    };
    const adapter = new CodexCurrentAdapter(
      {
        querySelectorAll: (sel: string) => (sel.includes("user-message") ? [node as unknown as Element] : []),
        querySelector: () => null,
      },
      { pathname: "/thread/t1", href: "https://codex.local/thread/t1" },
    );
    const prompts = await adapter.listUserPrompts();
    assert.equal(prompts.ok, true);
    if (prompts.ok) {
      assert.equal(prompts.value.length, 1);
      assert.equal(prompts.value[0]?.turnId, "turn-9");
      assert.equal(prompts.value[0]?.title, "hello navigator");
      assert.notEqual(prompts.value[0]?.contentHash, "hello navigator");
      assert.equal(prompts.value[0]?.contentHash.length, 64);
    }
    const jump = adapter.jumpToPrompt({ turnId: "turn-9" });
    assert.equal(jump.ok, true);
    assert.equal(node.scrollIntoViewCalls, 1);
  });

  it("lockViewport is no-op on desktop and allowed only in preview", () => {
    const emptyDom = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    const desktop = new CodexCurrentAdapter(emptyDom, { pathname: "/thread/t1", href: "https://codex.local/thread/t1" });
    const locked = desktop.lockViewport(true);
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.code, "DISABLED");

    const preview = new CodexCurrentAdapter(
      emptyDom,
      { pathname: "/thread/t1", href: "https://preview.local/thread/t1" },
      "preview",
    );
    const allowed = preview.lockViewport(true);
    assert.equal(allowed.ok, true);
  });
});
