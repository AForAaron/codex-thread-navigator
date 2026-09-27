import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NavigationSession } from "./session.js";
import type { ConversationHost, ConversationIdentity, HistoryPage, NavigationTarget, HistoryMessage } from "./host.js";
import type { ReadingAnchor } from "../reading/types.js";

const identity: ConversationIdentity = { surface: "chat", threadId: "a", branchId: "main", windowId: "one" };
const message: HistoryMessage = { turnId: "turn", itemId: "answer", role: "assistant", text: "answer-only needle needle" };
const target: NavigationTarget = { turnId: "turn", itemId: "answer", range: { start: 12, end: 18 } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function mock(id = identity) {
  let intent = () => {};
  let content: (rows: readonly HistoryMessage[]) => void = () => {};
  let switchIdentity: (next: ConversationIdentity) => void = () => {};
  const revealed: NavigationTarget[] = [];
  const restored: ReadingAnchor[] = [];
  const counts = { disposed: 0, stops: 0 };
  const host: ConversationHost = {
    identity: id, compensationOwner: "native",
    readHistoryPage: async () => ({ messages: [message], nextCursor: null, coverage: "complete" }),
    ensureTargetLoaded: async () => {}, waitForLayout: async () => {},
    revealTarget: async row => { revealed.push(row); },
    captureAnchor: () => ({ threadId: id.threadId, turnId: "turn", itemId: "answer", viewportOffset: -12 }),
    restoreAnchor: async anchor => { restored.push(anchor); },
    subscribeIdentity: fn => { switchIdentity = fn; return () => { counts.stops++; switchIdentity = () => {}; }; },
    subscribeContent: fn => { content = fn; return () => { counts.stops++; content = () => {}; }; },
    subscribeUserIntent: fn => { intent = fn; return () => { counts.stops++; intent = () => {}; }; },
    subscribeLayout: () => () => {}, dispose: () => { counts.disposed++; },
  };
  return { host, revealed, restored, counts, intent: () => intent(), stream: (rows: HistoryMessage[]) => content(rows), switch: (id: ConversationIdentity) => switchIdentity(id) };
}

describe("NavigationSession host-independent lifecycle", () => {
  it("searches unloaded history pages and preserves exact answer ranges", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host);
    fixture.host.readHistoryPage = async cursor => cursor === null
      ? { messages: [], nextCursor: "older", coverage: "partial" }
      : { messages: [message], nextCursor: null, coverage: "complete" };
    assert.equal(session.search("needle").complete, false);
    assert.equal(await session.loadHistory(), true);
    const result = session.search("needle");
    assert.equal(result.complete, true);
    assert.deepEqual(result.hits.map(row => [row.itemId, row.role, row.index, row.end]), [["answer", "assistant", 12, 18], ["answer", "assistant", 19, 25]]);
    assert.equal(await session.jump(target), true);
    assert.deepEqual(fixture.revealed, [target]);
  });
  it("does not equate exhaustion with full history coverage", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host);
    fixture.host.readHistoryPage = async () => ({ messages: [message], nextCursor: null, coverage: "partial" });
    assert.equal(await session.loadHistory(), false);
    assert.equal(session.search("needle").hits.length, 2);
    assert.equal(session.search("needle").complete, false);
  });
  it("rejects repeated cursors rather than looping forever", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host);
    fixture.host.readHistoryPage = async () => ({ messages: [message], nextCursor: "same", coverage: "partial" });
    assert.equal(await session.loadHistory(), false);
    assert.equal(session.snapshot().status, "failed");
    assert.match(session.snapshot().error!, /Repeated/);
  });
  it("discards A's history even when its loader ignores cancellation", async () => {
    const a = mock(); const b = mock({ ...identity, threadId: "b" }); const pending = deferred<HistoryPage>();
    a.host.readHistoryPage = () => pending.promise;
    const session = new NavigationSession(); session.attach(a.host); const old = session.loadHistory();
    session.attach(b.host); pending.resolve({ messages: [message], nextCursor: null, coverage: "complete" });
    assert.equal(await old, false);
    assert.equal(session.snapshot().identity?.threadId, "b");
    assert.equal(session.snapshot().messageCount, 0);
    assert.equal(a.counts.disposed, 1);
    assert.equal(a.counts.stops, 3);
  });
  it("only the latest rapid jump may reveal a target", async () => {
    const fixture = mock(); const wait = deferred<void>(); let calls = 0;
    fixture.host.ensureTargetLoaded = () => ++calls === 1 ? wait.promise : Promise.resolve();
    const session = new NavigationSession(); session.attach(fixture.host);
    const old = session.jump({ ...target, itemId: "old" });
    assert.equal(await session.jump(target), true);
    wait.resolve(); assert.equal(await old, false);
    assert.deepEqual(fixture.revealed, [target]);
  });
  it("user intent cancels restore before layout completion", async () => {
    const fixture = mock(); const wait = deferred<void>(); fixture.host.waitForLayout = () => wait.promise;
    const session = new NavigationSession(); session.attach(fixture.host);
    const anchor = session.capture()!; const restoring = session.restore(anchor);
    await Promise.resolve(); fixture.intent(); wait.resolve();
    assert.equal(await restoring, false);
    assert.equal(fixture.restored.length, 0);
    assert.equal(session.snapshot().mode, "READING");
  });
  it("never applies another surface, branch or window anchor", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host);
    const anchor = session.capture()!;
    for (const changed of [{ surface: "codex" as const }, { branchId: "fork" }, { windowId: "two" }, { threadId: "other" }]) {
      assert.equal(await session.restore({ ...anchor, identity: { ...identity, ...changed } }), false);
    }
    assert.equal(await session.restore({ threadId: "a", turnId: "turn", itemId: "answer" }), false);
    assert.equal(fixture.restored.length, 0);
  });
  it("suppresses capture while programmatic movement is pending", async () => {
    const fixture = mock(); const wait = deferred<void>(); fixture.host.ensureTargetLoaded = () => wait.promise;
    const session = new NavigationSession(); session.attach(fixture.host); const jump = session.jump(target);
    assert.equal(session.capture(), null);
    wait.resolve(); await jump;
    assert.deepEqual(session.capture()?.identity, identity);
  });
  it("keeps streamed content newer than a historical page", async () => {
    const fixture = mock(); const wait = deferred<HistoryPage>(); fixture.host.readHistoryPage = () => wait.promise;
    const session = new NavigationSession(); session.attach(fixture.host); const load = session.loadHistory();
    fixture.stream([{ ...message, text: "new streamed marker" }]);
    wait.resolve({ messages: [message], nextCursor: null, coverage: "complete" }); await load;
    assert.equal(session.search("streamed").hits.length, 1);
    assert.equal(session.search("needle").hits.length, 0);
  });
  it("complete reload replaces edited history and removes deleted messages", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host);
    await session.loadHistory();
    fixture.host.readHistoryPage = async () => ({ messages: [{ ...message, text: "edited" }], nextCursor: null, coverage: "complete" });
    await session.loadHistory(); assert.equal(session.search("needle").hits.length, 0);
    assert.equal(session.search("edited").hits.length, 1);
    fixture.host.readHistoryPage = async () => ({ messages: [], nextCursor: null, coverage: "complete" });
    await session.loadHistory(); assert.equal(session.snapshot().messageCount, 0);
  });
  it("same-host attachment is idempotent", () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host); session.attach(fixture.host);
    assert.equal(fixture.counts.disposed, 0);
    session.detach(); assert.equal(fixture.counts.stops, 3);
  });
  it("branch switch clears text, cancels operations and releases listeners", async () => {
    const fixture = mock(); const session = new NavigationSession(); session.attach(fixture.host); await session.loadHistory();
    fixture.switch({ ...identity, branchId: "fork" });
    assert.equal(session.snapshot().identity, null);
    assert.equal(session.search("needle").hits.length, 0);
    session.detach(); assert.equal(fixture.counts.disposed, 1);
    assert.equal(fixture.counts.stops, 3);
  });
});
