import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { disconnectedQuota, fixtureSessionQuota, formatQuotaLine, formatResetRemain } from "./session-quota.js";

describe("session quota copy", () => {
  it("stays disconnected without inventing 93%", () => {
    const line = formatQuotaLine(disconnectedQuota());
    assert.equal(line, "会话额度未连接");
    assert.doesNotMatch(line, /93|周|token|\$/i);
  });

  it("formats the 5h fixture without weekly or money fields", () => {
    const now = Date.UTC(2026, 8, 12, 12, 0, 0);
    const quota = fixtureSessionQuota(now);
    const line = formatQuotaLine(quota, now);
    assert.match(line, /会话剩余 93%/);
    assert.match(line, /4h58m 后重置/);
    assert.doesNotMatch(line, /周|token|\$|268/i);
    assert.equal(formatResetRemain(now + 30 * 60 * 1000, now), "30m 后重置");
  });
});
