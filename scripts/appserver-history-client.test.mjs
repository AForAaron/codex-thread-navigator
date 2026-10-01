import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReadOnlyAppServer, messageIdentitySummary } from "./appserver-history-client.mjs";

const fixture = { thread: { id: "thread_12345678", turns: [
  { id: "turn_1", items: [{ type: "userMessage", id: "item_1", content: [{ type: "text", text: "private user text" }] },
    { type: "agentMessage", id: "item_2", text: "private answer" }] },
] } };
describe("read-only official App Server client", () => {
  it("extracts stable identities from full turns without persisting data", () => {
    const result = messageIdentitySummary(fixture, "thread_12345678");
    assert.equal(result.turnCount, 1);
    assert.deepEqual(result.stableMessageIds, ["item_1", "item_2"]);
    assert.equal(result.messages[1].text, "private answer");
  });
  it("fails closed for summary-only or duplicate ids", () => {
    assert.throws(() => messageIdentitySummary({ thread: { id: "thread_12345678", turns: [{ id: "turn_1" }] } }, "thread_12345678"), /fully loaded/);
    assert.throws(() => messageIdentitySummary({ thread: { id: "thread_12345678", turns: [{ id: "turn_1", items: [{ type: "agentMessage", id: "item_2" }] }] } }, "thread_12345678"), /text was not fully loaded/);
    assert.throws(() => messageIdentitySummary({ thread: { id: "thread_12345678", turns: [fixture.thread.turns[0], fixture.thread.turns[0]] } }, "thread_12345678"), /Duplicate turn/);
    assert.throws(() => messageIdentitySummary(fixture, "wrong"), /did not return/);
  });
  it("will never call a mutating RPC", async () => {
    const client = new ReadOnlyAppServer();
    assert.throws(() => client.request("thread/start", {}), /refuses/);
    assert.throws(() => client.notify("turn/start", {}), /refuses/);
    assert.throws(() => client.request("thread/delete", {}), /refuses/);
  });
});
