import assert from "node:assert/strict";
import test from "node:test";
import { isSessionHealthy } from "./check-session-health.mjs";

test("a fresh replacement session suppresses the obsolete runner failure", () => {
  const snapshot = { pluginLoaded: true, quotaSetter: true, quotaCount: 1, updatedAt: 1000 };
  assert.equal(isSessionHealthy(snapshot, 2000), true);
  assert.equal(isSessionHealthy({ ...snapshot, pluginLoaded: false }, 2000), false);
  assert.equal(isSessionHealthy({ ...snapshot, quotaSetter: false }, 2000), false);
  assert.equal(isSessionHealthy({ ...snapshot, quotaCount: 0 }, 2000), false);
  assert.equal(isSessionHealthy({ ...snapshot, updatedAt: NaN }, 2000), false);
  assert.equal(isSessionHealthy(snapshot, 151000), false);
});

test("native session health follows subscription state, not an independent snapshot timer", () => {
  const state = { source: "native-cache", pluginLoaded: true, quotaCount: 1, nativeAttached: true, quotaState: "ready", updatedAt: 1 };
  assert.equal(isSessionHealthy(state, 999999), true);
  assert.equal(isSessionHealthy({ ...state, nativeAttached: false }, 999999), false);
  assert.equal(isSessionHealthy({ ...state, quotaState: "unavailable" }, 999999), false);
});
