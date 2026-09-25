import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openNavigatorDb } from "./db.js";
import { assertIndexOnlySchema, readSchemaSql } from "./schema.js";

describe("schema", () => {
  it("does not define conversation body columns", () => {
    const violations = assertIndexOnlySchema(readSchemaSql());
    assert.deepEqual(violations, []);
    assert.match(readSchemaSql(), /content_hash/);
    assert.match(readSchemaSql(), /kind TEXT NOT NULL DEFAULT 'turn'/);
    assert.doesNotMatch(readSchemaSql(), /prompt_text/);
  });
});

describe("NavigatorDb", () => {
  it("stores index fields only and round-trips bookmarks / reading position", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-nav-"));
    const db = openNavigatorDb(join(dir, "navigator.sqlite"));
    try {
      db.upsertThread("thr-1", "A very long title that should be truncated if it exceeds the index label budget ".repeat(8));
      db.saveReadingPosition({
        threadId: "thr-1",
        turnId: "turn-2",
        itemId: "item-9",
        contentHash: "abc",
        offset: 120,
        viewportLocked: true,
      });
      const pos = db.getReadingPosition("thr-1");
      assert.equal(pos?.turnId, "turn-2");
      assert.equal(pos?.viewportLocked, true);
      const id = db.addBookmark({
        threadId: "thr-1",
        turnId: "turn-2",
        title: "checkpoint",
        contentHash: "abc",
        kind: "heading",
        headingId: "outline-h-01",
      });
      assert.ok(id > 0);
      const marks = db.listBookmarks("thr-1");
      assert.equal(marks.length, 1);
      assert.equal(marks[0]?.title, "checkpoint");
      assert.equal(marks[0]?.kind, "heading");
      assert.equal(marks[0]?.headingId, "outline-h-01");
      assert.equal(marks[0]?.orphaned, false);
      db.replacePromptIndex("thr-1", [
        {
          threadId: "thr-1",
          turnId: "turn-2",
          itemId: "item-9",
          ordinal: 0,
          title: "Prompt 1",
          contentHash: "abc",
          offset: 120,
        },
      ]);
      db.setPreference("plugin.enabled", "false");
      assert.equal(db.getPreference("plugin.enabled"), "false");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
