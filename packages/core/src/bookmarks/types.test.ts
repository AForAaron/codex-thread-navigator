import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookmarkId, markOrphanedBookmarks, preferBookmarkKind } from "./types.js";

describe("bookmarks", () => {
  it("marks bookmarks orphaned when the thread leaves the catalog, without deleting them", () => {
    const marked = markOrphanedBookmarks(
      [
        { id: "a", threadId: "live", kind: "turn", turnId: "t1", title: "ok", createdAt: 1 },
        { id: "b", threadId: "gone", kind: "heading", turnId: "t2", headingId: "h1", title: "old", createdAt: 2 },
      ],
      ["live"],
    );
    assert.equal(marked[0]?.orphaned, false);
    assert.equal(marked[1]?.orphaned, true);
    assert.equal(marked.length, 2);
  });

  it("prefers heading when one is visible", () => {
    assert.equal(preferBookmarkKind("h-3"), "heading");
    assert.equal(preferBookmarkKind(null), "message");
  });

  it("builds stable ids", () => {
    assert.equal(
      bookmarkId({ threadId: "th", kind: "heading", turnId: "t", itemId: "i", headingId: "h" }),
      "th:heading:t:i:h",
    );
  });
});
