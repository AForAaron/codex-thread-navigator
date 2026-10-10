import assert from "node:assert/strict";
import test from "node:test";
import { createRendererConnection } from "./renderer-connection.mjs";

function fixture() {
  const sockets = [];
  let targets = 0, recovered = 0;
  class Socket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.drop = false;
      sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }
    send(data) {
      if (this.drop) return;
      const { id, method } = JSON.parse(data);
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: { method, target: this.url } }) }));
    }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const channel = createRendererConnection({
    WebSocketImpl: Socket, discover: async () => `target-${++targets}`,
    onReconnect: async rawSend => { await rawSend("Page.enable"); recovered++; },
  });
  return { channel, sockets, recovered: () => recovered };
}

test("an open but unresponsive channel is discarded and the current target is rediscovered", async () => {
  const { channel, sockets, recovered } = fixture();
  assert.equal((await channel.send("Runtime.evaluate")).target, "target-1");
  sockets[0].drop = true;
  await assert.rejects(channel.send("Runtime.evaluate", {}, 10), /timed out/);
  assert.equal(sockets[0].readyState, 3);
  assert.equal((await channel.send("Runtime.evaluate")).target, "target-2");
  assert.equal(recovered(), 1);
  channel.close();
});

test("a closed renderer channel recovers but explicit shutdown does not reconnect", async () => {
  const { channel, sockets } = fixture();
  await channel.connect();
  sockets[0].close();
  assert.equal((await channel.send("Runtime.evaluate")).target, "target-2");
  channel.close();
  await assert.rejects(channel.send("Runtime.evaluate"), /closed/);
  assert.equal(sockets.length, 2);
});
