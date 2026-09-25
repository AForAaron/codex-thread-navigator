import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchPreviewShortcut, parseShortcut } from "./shortcuts.js";

describe("parseShortcut", () => {
  it("parses mac chords used in the preview", () => {
    assert.deepEqual(parseShortcut("⌘⇧N"), { meta: true, shift: true, alt: false, key: "n" });
    assert.deepEqual(parseShortcut("⌘⇧↑"), { meta: true, shift: true, alt: false, key: "arrowup" });
    assert.deepEqual(parseShortcut("⌥⌘B"), { meta: true, shift: false, alt: true, key: "b" });
    assert.deepEqual(parseShortcut("Escape"), { meta: false, shift: false, alt: false, key: "escape" });
  });

  it("parses explicit Meta+Shift tokens", () => {
    assert.deepEqual(parseShortcut("Meta+Shift+L"), { meta: true, shift: true, alt: false, key: "l" });
    assert.deepEqual(parseShortcut("Alt+Meta+B"), { meta: true, shift: false, alt: true, key: "b" });
  });
});

describe("matchPreviewShortcut", () => {
  it("matches default preview bindings from a keyboard event shape", () => {
    const toggle = matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "n" });
    assert.equal(toggle?.id, "toggleNavigator");
    const latest = matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "L" });
    assert.equal(latest?.id, "jumpLatest");
    const prev = matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "ArrowUp" });
    assert.equal(prev?.id, "prevPrompt");
    const bookmark = matchPreviewShortcut({ metaKey: true, altKey: true, key: "b" });
    assert.equal(bookmark?.id, "bookmark");
    const esc = matchPreviewShortcut({ key: "Escape" });
    assert.equal(esc?.id, "escape");
    const search = matchPreviewShortcut({ metaKey: true, shiftKey: true, key: "f" });
    assert.equal(search?.id, "search");
  });

  it("does not treat a plain N as toggle", () => {
    assert.equal(matchPreviewShortcut({ key: "n" }), null);
  });
});
