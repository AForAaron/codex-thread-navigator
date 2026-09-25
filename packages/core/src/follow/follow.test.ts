import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compensateScroll, reduceFollow, viewportLockAllowed } from "./follow.js";

describe("reduceFollow", () => {
  it("turns follow on near the bottom and off when the user scrolls up", () => {
    const near = reduceFollow({ following: false, unreadNew: false }, { type: "scroll", distanceFromBottom: 20, deltaY: 10 });
    assert.deepEqual(near, { following: true, unreadNew: false });
    const up = reduceFollow(near, { type: "scroll", distanceFromBottom: 400, deltaY: -30 });
    assert.equal(up.following, false);
  });

  it("marks unread new content when follow is off", () => {
    const next = reduceFollow({ following: false, unreadNew: false }, { type: "contentAppended", distanceFromBottom: 400 });
    assert.deepEqual(next, { following: false, unreadNew: true });
  });
});

describe("compensateScroll", () => {
  it("does not move the viewport when follow is off", () => {
    const out = compensateScroll({ following: false, previousScrollTop: 220, previousHeight: 1000, nextHeight: 1600 });
    assert.deepEqual(out, { scrollTop: 220, compensated: false });
  });

  it("sticks to the bottom growth when follow is on", () => {
    const out = compensateScroll({ following: true, previousScrollTop: 220, previousHeight: 1000, nextHeight: 1600 });
    assert.equal(out.scrollTop, 820);
    assert.equal(out.compensated, true);
  });
});

describe("viewportLockAllowed", () => {
  it("is preview-only", () => {
    assert.equal(viewportLockAllowed("preview"), true);
    assert.equal(viewportLockAllowed("desktop"), false);
  });
});
