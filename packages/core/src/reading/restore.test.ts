import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { restoreReadingPosition, restoreScopedReadingPosition } from "./restore.js";
import type { RestoreCandidate } from "./types.js";

const candidates: RestoreCandidate[] = [
  { turnId: "turn_u_007", itemId: "item_u_007_a", itemIndex: 6, blockHash: "hash-a" },
  { turnId: "turn_u_007", itemId: "item_u_007_b", itemIndex: 7, blockHash: "hash-b" },
  { turnId: "turn_u_015", itemId: "item_u_015", itemIndex: 14, blockHash: "hash-15" },
];

describe("restoreReadingPosition", () => {
  it("prefers turn + item + block", () => {
    const result = restoreReadingPosition(
      { threadId: "t", turnId: "turn_u_007", itemId: "item_u_007_b", blockHash: "hash-b", itemIndex: 7 },
      candidates,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tier, "turn+item+block");
      assert.equal(result.candidate.itemId, "item_u_007_b");
    }
  });

  it("falls back to turn + item when block is gone", () => {
    const result = restoreReadingPosition(
      { threadId: "t", turnId: "turn_u_007", itemId: "item_u_007_a", blockHash: "stale-block" },
      candidates,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tier, "turn+item");
      assert.equal(result.candidate.blockHash, "hash-a");
    }
  });

  it("falls back to turn (prefer itemIndex) when item is gone", () => {
    const result = restoreReadingPosition(
      { threadId: "t", turnId: "turn_u_007", itemId: "missing", itemIndex: 7 },
      candidates,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tier, "turn");
      assert.equal(result.candidate.itemId, "item_u_007_b");
    }
  });

  it("returns none when the turn is unknown", () => {
    const result = restoreReadingPosition({ threadId: "t", turnId: "turn_missing" }, candidates);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.tier, "none");
  });
});

describe("scoped reading restore", () => {
  it("keeps block/message/turn fallback within the selected branch and window", () => {
    const identity = { surface: "chat" as const, threadId: "t", branchId: "b", windowId: "w" };
    const anchor = { threadId: "t", identity, turnId: "turn_u_007", itemId: "missing", blockHash: "gone" };
    const result = restoreScopedReadingPosition(anchor, identity, candidates);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.tier, "turn");
    assert.equal(restoreScopedReadingPosition(anchor, { ...identity, branchId: "other" }, candidates).ok, false);
    assert.equal(restoreScopedReadingPosition(anchor, { ...identity, windowId: "other" }, candidates).ok, false);
    assert.equal(restoreScopedReadingPosition({ threadId: "t", turnId: "turn_u_007" }, identity, candidates).ok, false);
  });
});
