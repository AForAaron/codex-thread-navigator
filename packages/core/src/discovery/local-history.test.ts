import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { openNavigatorDb } from "../persistence/db.js";
import { firstMarkdownHeading, listLocalThreads, listLocalUserPrompts } from "./local-history.js";
import { indexLocalThread, saveLocalBookmarks, saveLocalReadingPosition } from "./anchors.js";

function seedHistory(path: string): { threadId: string; turnId: string; itemId: string } {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE thread_items (
      thread_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      rollout_ordinal INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      item_json TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT '',
      updated_at_ordinal INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (thread_id, turn_id, item_id)
    );
  `);
  const threadId = "019e0000-aaaa-7bbb-8ccc-ddddeeeeffff";
  const turnId = "019e0001-aaaa-7bbb-8ccc-ddddeeeeffff";
  const itemId = "019e0002-aaaa-7bbb-8ccc-ddddeeeeffff";
  const body = "synthetic user prompt used only in unit tests, long enough to truncate for the catalog title field.";
  db.prepare(
    `INSERT INTO thread_items(thread_id, turn_id, item_id, rollout_ordinal, created_at_ms, item_json, item_type)
     VALUES (?, ?, ?, 1, 1, ?, 'userMessage')`,
  ).run(
    threadId,
    turnId,
    itemId,
    JSON.stringify({ type: "userMessage", id: "item-1", content: [{ type: "text", text: body }] }),
  );
  db.close();
  return { threadId, turnId, itemId };
}

describe("local thread history discovery", () => {
  it("indexes real-shaped ids without storing conversation body", () => {
    const dir = mkdtempSync(join(tmpdir(), "cn-hist-"));
    const historyPath = join(dir, "thread_history_1.sqlite");
    const navPath = join(dir, "navigator.sqlite");
    const ids = seedHistory(historyPath);
    const paths = { historyPath, catalogPath: null };
    try {
      const threads = listLocalThreads(paths);
      assert.equal(threads.length, 1);
      assert.equal(threads[0]?.threadId, ids.threadId);
      assert.match(threads[0]!.threadId, /^019e0000-/);
      const prompts = listLocalUserPrompts(ids.threadId, paths);
      assert.equal(prompts.length, 1);
      assert.equal(prompts[0]?.turnId, ids.turnId);
      assert.equal(prompts[0]?.itemId, ids.itemId);
      assert.ok((prompts[0]?.title.length ?? 0) <= 50);
      assert.equal(prompts[0]?.contentHash.length, 64);

      const nav = openNavigatorDb(navPath);
      try {
        indexLocalThread(nav, threads[0]!, prompts);
        saveLocalReadingPosition(nav, prompts[0]!);
        saveLocalBookmarks(nav, prompts[0]!, firstMarkdownHeading("## 合成标题"));
        const pos = nav.getReadingPosition(ids.threadId);
        assert.equal(pos?.turnId, ids.turnId);
        assert.equal(pos?.itemId, ids.itemId);
        const marks = nav.listBookmarks(ids.threadId);
        assert.equal(marks.length, 3);
        assert.deepEqual(marks.map((row) => row.kind).sort(), ["heading", "message", "turn"]);
        assert.equal(marks[0]?.turnId, ids.turnId);
        const dumped = JSON.stringify(nav.listPromptIndex(ids.threadId));
        assert.doesNotMatch(dumped, /long enough to truncate for the catalog title field/);
      } finally {
        nav.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts the first markdown heading without keeping the rest", () => {
    const heading = firstMarkdownHeading("# 第一节\n后面还有很长的说明文字不应该进 headingId。");
    assert.ok(heading);
    assert.match(heading!.headingId, /^h-[0-9a-f]{12}$/);
    assert.ok(!heading!.title.includes("不应该进"));
  });

  it("does not open ~/.codex unless CODEX_NAV_READ_HISTORY=1 or an explicit path is passed", () => {
    const prev = process.env.CODEX_NAV_READ_HISTORY;
    delete process.env.CODEX_NAV_READ_HISTORY;
    try {
      assert.deepEqual(listLocalThreads(), []);
      assert.deepEqual(listLocalUserPrompts("019e0000-aaaa-7bbb-8ccc-ddddeeeeffff"), []);
    } finally {
      if (prev === undefined) delete process.env.CODEX_NAV_READ_HISTORY;
      else process.env.CODEX_NAV_READ_HISTORY = prev;
    }
  });
});
