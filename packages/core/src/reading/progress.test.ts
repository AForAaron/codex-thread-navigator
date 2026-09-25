import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewSnippet, previewTitle, ratioFromTurnIndex, turnIndexFromRatio } from "./progress.js";

describe("conversation progress mapping", () => {
  it("maps the left of the bar to the first turn and the right to the last", () => {
    assert.equal(turnIndexFromRatio(0, 16), 0);
    assert.equal(turnIndexFromRatio(0.99, 16), 15);
    assert.equal(turnIndexFromRatio(1, 16), 15);
  });

  it("keeps the current-turn marker at the matching ratio", () => {
    assert.equal(ratioFromTurnIndex(0, 16), 0);
    assert.equal(ratioFromTurnIndex(15, 16), 1);
  });

  it("clips preview copy instead of keeping the whole reply", () => {
    const long = "本地点安全核心测试已通过：36个动作矩阵正常，云函数共105项通过。".repeat(3);
    const snippet = previewSnippet(long, 40);
    assert.ok(snippet.endsWith("…"));
    assert.ok(snippet.length <= 40);
    assert.ok(previewTitle(long).length <= 22);
  });
});
