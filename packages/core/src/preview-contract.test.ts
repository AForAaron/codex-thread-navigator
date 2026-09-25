import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodexCurrentAdapter } from "./adapters/codex-current.js";
import { truncatePromptTitle } from "./hash.js";
import { matchPreviewShortcut } from "./keymap/shortcuts.js";
import { restoreReadingPosition } from "./reading/restore.js";

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

function makeUserNode(i: number) {
  const body = `User prompt ${pad(i)}: navigate the long thread index without copying conversation body. Marker=thread_preview_nav_001/turn_u_${pad(i)}. Extra sentence kept only in the preview DOM, never in storage.`;
  let scrolled = false;
  return {
    body,
    scrollIntoViewCalls: 0,
    textContent: body,
    getAttribute(name: string) {
      if (name === "data-turn-id") return `turn_u_${pad(i)}`;
      if (name === "data-item-id") return `item_u_${pad(i)}`;
      if (name === "data-item-index") return String(i - 1);
      if (name === "data-block-hash") return `block_${pad(i)}`;
      return null;
    },
    scrollIntoView() {
      scrolled = true;
      this.scrollIntoViewCalls += 1;
    },
    get scrolled() {
      return scrolled;
    },
  };
}

describe("preview contract (90 fixture prompts, no Desktop)", () => {
  it("scans 90 user prompts, truncates titles, jumps, and restores with fallback", async () => {
    const nodes = Array.from({ length: 90 }, (_, i) => makeUserNode(i + 1));
    const adapter = new CodexCurrentAdapter(
      {
        querySelectorAll: (sel: string) => (sel.includes("user-message") ? (nodes as unknown as Element[]) : []),
        querySelector: () => ({ scrollTop: 480 } as unknown as Element),
      },
      { pathname: "/thread/thread_preview_nav_001", href: "https://preview.local/thread/thread_preview_nav_001" },
    );

    const thread = adapter.getCurrentThreadId();
    assert.equal(thread.ok && thread.value, "thread_preview_nav_001");

    const listed = await adapter.listUserPrompts();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.value.length, 90);
    assert.equal(listed.value[0]?.turnId, "turn_u_001");
    assert.equal(listed.value[89]?.turnId, "turn_u_090");
    for (const row of listed.value) {
      assert.ok(row.title.length <= 50);
      assert.ok(!row.title.includes("never in storage"));
      assert.equal(row.title, truncatePromptTitle(nodes[row.itemIndex ?? 0]!.body));
    }

    const jump = adapter.jumpToPrompt({ turnId: "turn_u_042", itemId: "item_u_042", blockHash: "block_042" });
    assert.equal(jump.ok, true);
    assert.ok(nodes[41]!.scrollIntoViewCalls >= 1);

    const saved = {
      threadId: "thread_preview_nav_001",
      turnId: "turn_u_042",
      itemId: "item_u_042",
      itemIndex: 41,
      blockHash: "stale",
      offset: 480,
    };
    const restored = restoreReadingPosition(saved, listed.value);
    assert.equal(restored.ok, true);
    if (restored.ok) {
      assert.equal(restored.tier, "turn+item");
      assert.equal(restored.candidate.turnId, "turn_u_042");
    }

    adapter.jumpToLatest();
    assert.ok(nodes[89]!.scrollIntoViewCalls >= 1);

    assert.equal(matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "n" })?.id, "toggleNavigator");
    assert.equal(matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "ArrowDown" })?.id, "nextPrompt");
    assert.equal(matchPreviewShortcut({ metaKey: true, altKey: true, key: "b" })?.id, "bookmark");
    assert.equal(matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "l" })?.id, "jumpLatest");
    assert.equal(matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "f" })?.id, "search");
    assert.equal(matchPreviewShortcut({ key: "Escape" })?.id, "escape");

    const desktopLock = adapter.lockViewport(true);
    assert.equal(desktopLock.ok, false);
    if (!desktopLock.ok) assert.equal(desktopLock.code, "DISABLED");
  });
});
