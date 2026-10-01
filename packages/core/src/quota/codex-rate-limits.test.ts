import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { codexUsageWindows, parseCodexRateLimits, quotaWindowLabel } from "./codex-rate-limits.js";

describe("Codex rate-limit presentation", () => {
  it("reads the codex bucket and converts used percentages to remaining percentages", () => {
    const result = parseCodexRateLimits({
      rateLimitsByLimitId: {
        codex_other: { limitId: "codex_other", primary: { usedPercent: 99 } },
        codex: {
          limitId: "codex",
          primary: { usedPercent: 27.5, windowDurationMins: 300, resetsAt: 1_780_000_000 },
          secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1_780_500_000 },
        },
      },
      rateLimitResetCredits: { availableCount: 1, credits: [{ id: "not-for-display", status: "available" }] },
    });
    assert.equal(result?.primary?.remainingPercent, 72.5);
    assert.equal(result?.secondary?.remainingPercent, 60);
    assert.equal(result?.primary?.resetsAt, 1_780_000_000_000);
    assert.equal(result?.resetCreditsAvailable, 1);
    assert.equal(quotaWindowLabel(result!.primary!), "5小时额度");
    assert.equal(quotaWindowLabel(result!.secondary!), "7天额度");
  });

  it("does not invent quota from unrelated or invalid buckets", () => {
    assert.equal(parseCodexRateLimits({ rateLimits: { limitId: "other", primary: { usedPercent: 20 } } }), null);
    assert.equal(parseCodexRateLimits({ rateLimits: { limitId: "codex", primary: { usedPercent: 140 } } }), null);
    assert.equal(parseCodexRateLimits({ rateLimitsByLimitId: { codex: { limitId: "codex" } } }), null);
  });

  it("accepts the documented legacy bucket when no multi-bucket result exists", () => {
    const result = parseCodexRateLimits({ result: {
      rateLimits: { limitId: "codex", primary: { usedPercent: 0, windowDurationMins: 300 } },
    } });
    assert.equal(result?.primary?.remainingPercent, 100);
    assert.equal(result?.primary?.resetsAt, null);
    assert.equal(result?.resetCreditsAvailable, null);
  });

  it("distinguishes zero available resets from absent or malformed reset-credit data", () => {
    const rateLimits = { limitId: "codex", primary: { usedPercent: 20, windowDurationMins: 300 } };
    assert.equal(parseCodexRateLimits({ rateLimits, rateLimitResetCredits: { availableCount: 0 } })?.resetCreditsAvailable, 0);
    assert.equal(parseCodexRateLimits({ rateLimits, rateLimitResetCredits: { availableCount: -1 } })?.resetCreditsAvailable, null);
    assert.equal(parseCodexRateLimits({ rateLimits, rateLimitResetCredits: { availableCount: "2" } })?.resetCreditsAvailable, null);
  });

  it("identifies five-hour and weekly limits by duration even when API order changes", () => {
    const weekly = { remainingPercent: 41, windowDurationMins: 10080, resetsAt: null };
    const fiveHour = { remainingPercent: 83, windowDurationMins: 300, resetsAt: null };
    assert.deepEqual(codexUsageWindows({ primary: weekly, secondary: fiveHour, resetCreditsAvailable: null }), { fiveHour, weekly });
    assert.deepEqual(codexUsageWindows({ primary: { ...weekly, windowDurationMins: 1440 }, secondary: null, resetCreditsAvailable: null }), {
      fiveHour: null,
      weekly: null,
    });
  });
});
