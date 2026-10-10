import assert from "node:assert/strict";
import test from "node:test";
import { parseNativeRateLimits } from "./native-rate-limits.js";
import { codexUsageWindows } from "./codex-rate-limits.js";

const window = (used: number, seconds: number) => ({ used_percent: used, limit_window_seconds: seconds, reset_at: 1790000000 });

test("native quota keeps fractional precision until display and maps windows by duration", () => {
  const limits = parseNativeRateLimits({ rate_limit: { primary_window: window(99.51, 18000), secondary_window: window(83.6, 604800) },
    rate_limit_reset_credits: { available_count: 0 } });
  assert.ok(limits);
  const windows = codexUsageWindows(limits);
  assert.equal(Math.round(windows.fiveHour!.remainingPercent), 0);
  assert.equal(Math.round(windows.weekly!.remainingPercent), 16);
  assert.equal(limits.resetCreditsAvailable, 0);
  assert.equal(limits.primary!.resetsAt, 1790000000000);
});

test("malformed native snapshots cannot become invented percentages or reset counts", () => {
  assert.equal(parseNativeRateLimits({ rate_limit: { primary_window: window(NaN, 18000) } }), null);
  assert.equal(parseNativeRateLimits({ rate_limit: { primary_window: window(-1, 18000) } }), null);
  const limits = parseNativeRateLimits({ rate_limit: { primary_window: window(100, 18000) }, rate_limit_reset_credits: { available_count: -1 } });
  assert.equal(limits!.resetCreditsAvailable, null);
  assert.equal(limits!.primary!.remainingPercent, 0);
});
