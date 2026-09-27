import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchTurns, type SearchableTurn } from "./search.js";

describe("searchTurns", () => {
  it("returns every occurrence with exact message ranges and respects limit", () => {
    const rows: SearchableTurn[] = [{ turnId: "answer", itemId: "message", role: "assistant", text: "needle then NEEDLE" }];
    assert.deepEqual(searchTurns(rows, "needle").map(hit => [hit.itemId, hit.index, hit.end]), [["message", 0, 6], ["message", 12, 18]]);
    assert.equal(searchTurns(rows, "needle", 1).length, 1);
    assert.equal(searchTurns(rows, "  ").length, 0);
  });
  it("finds the unique marker turn", () => {
    const turns: SearchableTurn[] = [
      { turnId: "a", role: "user", text: "hello world" },
      { turnId: "turn_u_042", role: "user", text: "navigate Marker=UNIQUE_NEEDLE_042 extra" },
    ];
    const hits = searchTurns(turns, "UNIQUE_NEEDLE_042");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.turnId, "turn_u_042");
    assert.match(hits[0]?.snippet ?? "", /UNIQUE_NEEDLE_042/);
  });

  it("searches 500 in-memory turns in under 100ms", () => {
    const turns: SearchableTurn[] = Array.from({ length: 500 }, (_, i) => ({
      turnId: `turn_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      text: `payload ${i} lorem ipsum dolor sit amet ${i === 321 ? "NEEDLE_500" : "zzzz"}`,
    }));
    const t0 = performance.now();
    const hits = searchTurns(turns, "NEEDLE_500");
    const ms = performance.now() - t0;
    assert.equal(hits[0]?.turnId, "turn_321");
    assert.ok(ms < 100, `search took ${ms}ms`);
  });
  it("searches 1000 rounds with p95 below 100ms and keeps answer identity", () => {
    const turns: SearchableTurn[] = Array.from({ length: 2000 }, (_, i) => ({
      turnId: `turn_${i}`, itemId: `item_${i}`, role: i % 2 ? "assistant" : "user",
      text: "正文数据 ".repeat(60) + (i === 1999 ? "TARGET_1000 TARGET_1000" : ""),
    }));
    const samples = Array.from({ length: 20 }, () => {
      const started = performance.now();
      const hits = searchTurns(turns, "TARGET_1000");
      assert.equal(hits.length, 2);
      assert.equal(hits[0]?.itemId, "item_1999");
      return performance.now() - started;
    }).sort((a, b) => a - b);
    assert.ok(samples[18]! < 100, `p95=${samples[18]}ms`);
  });
});
