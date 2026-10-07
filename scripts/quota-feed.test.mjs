import assert from "node:assert/strict";
import test from "node:test";
import { createQuotaFeed } from "./quota-feed.mjs";

test("a disconnected quota client is closed and replaced by a fresh connection", async () => {
  let created = 0, closed = 0;
  const feed = createQuotaFeed({ createClient: () => {
    const index = ++created;
    return { async connect() {}, async readRateLimits() {
      if (index === 1) throw new Error("Not connected");
      return { weekly: 100 };
    }, async close() { closed++; } };
  } });
  assert.deepEqual(await feed.readRateLimits(), { weekly: 100 });
  assert.equal(created, 2);
  assert.equal(closed, 1);
  await feed.readRateLimits();
  assert.equal(created, 2, "healthy connection is reused");
  await feed.close();
  assert.equal(closed, 2);
  await assert.rejects(feed.readRateLimits(), /closed/);
});

test("failed retries leave no dead client; the next refresh can recover", async () => {
  let attempts = 0, closed = 0;
  const feed = createQuotaFeed({ createClient: () => ({
    async connect() {}, async readRateLimits() {
      if (++attempts < 3) throw new Error("timed out");
      return { weekly: 100 };
    }, async close() { closed++; },
  }) });
  await assert.rejects(feed.readRateLimits(), /timed out/);
  assert.equal(closed, 2);
  assert.deepEqual(await feed.readRateLimits(), { weekly: 100 });
  await feed.close();
});
