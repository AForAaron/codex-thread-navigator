import { createUnavailableAppServerClient } from "./client.js";
import { isDocumentedAppServerType } from "./types.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("UnavailableAppServerClient", () => {
  it("does not invent thread/turn listings", async () => {
    const client = createUnavailableAppServerClient();
    assert.equal(client.isAvailable(), false);
    const thread = await client.getCurrentThreadId();
    const turn = await client.getCurrentTurnId();
    const turns = await client.listUserTurns("thread-1");
    assert.equal(thread.ok, false);
    assert.equal(turn.ok, false);
    assert.equal(turns.ok, false);
    if (!turns.ok) assert.equal(turns.code, "UNVERIFIED_RPC");
  });

  it("only accepts documented send types at the type-guard layer", () => {
    assert.equal(isDocumentedAppServerType("get-setting"), true);
    assert.equal(isDocumentedAppServerType("list-user-messages"), false);
    assert.equal(isDocumentedAppServerType("thread/list"), false);
  });
});
