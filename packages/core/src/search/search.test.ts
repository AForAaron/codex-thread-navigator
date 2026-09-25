import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchTurns, type SearchableTurn } from "./search.js";

describe("searchTurns", () => {
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
});
