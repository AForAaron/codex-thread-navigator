import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNavigatorExport, exportForbiddenKeys } from "./export.js";

describe("navigator export", () => {
  it("contains only index fields", () => {
    const data = buildNavigatorExport({
      threads: [{ threadId: "t", title: "Preview" }],
      anchors: [{ threadId: "t", turnId: "turn_u_001", offset: 12 }],
      bookmarks: [{ id: "b", threadId: "t", kind: "turn", turnId: "turn_u_001", title: "Prompt 1" }],
      preferences: { autoRestore: true },
    });
    assert.deepEqual(exportForbiddenKeys(data), []);
    assert.equal(data.bookmarks[0]?.title, "Prompt 1");
  });

  it("flags a body leak", () => {
    assert.ok(exportForbiddenKeys({ bookmarks: [{ body: "nope" }] }).includes("bookmarks.0.body"));
  });
});
