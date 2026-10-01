#!/usr/bin/env node
/** Read-only Codex App Server history client. Never prints or persists message text. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const TIMEOUT_MS = 15000;
const ALLOWED = new Set(["initialize", "thread/read", "thread/turns/list", "account/rateLimits/read"]);

export function messageIdentitySummary(result, requestedThreadId) {
  const thread = result?.thread;
  if (!thread || thread.id !== requestedThreadId || !Array.isArray(thread.turns)) {
    throw new Error("App Server did not return this thread with a turns array");
  }
  const turns = thread.turns;
  const turnIds = turns.map(turn => turn?.id);
  if (turnIds.some(id => typeof id !== "string" || !id)) throw new Error("Turn without a stable id");
  if (new Set(turnIds).size !== turnIds.length) throw new Error("Duplicate turn id");
  const messages = [];
  for (const turn of turns) {
    if (!Array.isArray(turn.items)) throw new Error("Turn items were not fully loaded");
    for (const item of turn.items) {
      if (item?.type !== "userMessage" && item?.type !== "agentMessage") continue;
      if (typeof item.id !== "string" || !item.id) throw new Error("Message without a stable id");
      if (item.type === "userMessage" && !Array.isArray(item.content)) throw new Error("User message content was not fully loaded");
      if (item.type === "agentMessage" && typeof item.text !== "string") throw new Error("Agent message text was not fully loaded");
      const text = item.type === "userMessage"
        ? item.content.filter(part => part?.type === "text").map(part => part.text ?? "").join("\n")
        : item.text;
      messages.push({ turnId: turn.id, itemId: item.id, role: item.type, text });
    }
  }
  if (new Set(messages.map(row => row.itemId)).size !== messages.length) throw new Error("Duplicate message id");
  return {
    threadId: requestedThreadId, turnCount: turns.length, messageCount: messages.length,
    userCount: messages.filter(row => row.role === "userMessage").length,
    answerCount: messages.filter(row => row.role === "agentMessage").length,
    stableTurnIds: turnIds, stableMessageIds: messages.map(row => row.itemId),
    messages,
  };
}

export class ReadOnlyAppServer {
  constructor({ command = "codex", args = ["app-server", "--stdio"], timeoutMs = TIMEOUT_MS } = {}) {
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.pending = new Map();
    this.nextId = 0;
  }
  async connect() {
    if (this.child) throw new Error("Already connected");
    const child = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const reader = createInterface({ input: child.stdout });
    reader.on("line", line => {
      let response;
      try { response = JSON.parse(line); } catch { return; }
      if (!Object.hasOwn(response, "id")) return;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error) pending.reject(new Error(`App Server RPC ${pending.method} failed: ${String(response.error.message ?? response.error.code)}`));
      else pending.resolve(response.result);
    });
    const fail = error => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();
    };
    child.on("error", fail);
    child.on("exit", code => fail(new Error(`App Server exited (${code})`)));
    // Do not forward stderr: it may contain user paths or sensitive diagnostics.
    child.stderr.resume();
    try {
      await this.request("initialize", { clientInfo: { name: "codex_navigator_readonly", title: "Codex Navigator Read-only History", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      this.notify("initialized", {});
    } catch (error) { await this.close(); throw error; }
  }
  request(method, params) {
    if (!ALLOWED.has(method)) throw new Error(`Read-only client refuses ${method}`);
    if (!this.child || !this.child.stdin.writable) throw new Error("Not connected");
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`App Server ${method} timed out`));
        this.child?.kill("SIGTERM");
      }, this.timeoutMs);
      this.pending.set(id, { method, timer, resolve, reject });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  notify(method, params) {
    if (method !== "initialized") throw new Error(`Read-only client refuses notification ${method}`);
    this.child?.stdin.write(JSON.stringify({ method, params }) + "\n");
  }
  async read(threadId) {
    if (typeof threadId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(threadId)) throw new Error("Invalid thread id");
    try {
      const result = await this.request("thread/read", { threadId, includeTurns: true });
      return { ...messageIdentitySummary(result, threadId), method: "thread/read" };
    } catch (error) {
      if (!String(error).includes("paginated threads do not support thread/read(includeTurns=true)")) throw error;
    }
    const turns = [];
    const seen = new Set();
    let cursor = null;
    for (let pageCount = 0; pageCount < 1000; pageCount++) {
      const params = { threadId, limit: 50, sortDirection: "desc", itemsView: "full" };
      if (cursor !== null) params.cursor = cursor;
      const page = await this.request("thread/turns/list", params);
      if (!Array.isArray(page?.data) || !(page.nextCursor === null || typeof page.nextCursor === "string")) {
        throw new Error("App Server pagination response is incomplete");
      }
      turns.push(...page.data);
      if (page.nextCursor === null) {
        turns.reverse();
        return { ...messageIdentitySummary({ thread: { id: threadId, turns } }, threadId), method: "thread/turns/list" };
      }
      if (seen.has(page.nextCursor)) throw new Error("Repeated App Server history cursor");
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error("History exceeded the 1000 page safety limit");
  }
  async readRateLimits() {
    return this.request("account/rateLimits/read", {});
  }
  async close() {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.stdin.end();
    child.kill("SIGTERM");
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Closed")); }
    this.pending.clear();
  }
}

async function main() {
  const threadId = process.argv[2];
  if (!threadId) { console.error("Usage: node scripts/appserver-history-client.mjs <known-thread-id>"); process.exitCode = 2; return; }
  const client = new ReadOnlyAppServer();
  try {
    await client.connect();
    const first = await client.read(threadId);
    const second = await client.read(threadId);
    const idsStable = JSON.stringify(first.stableTurnIds) === JSON.stringify(second.stableTurnIds)
      && JSON.stringify(first.stableMessageIds) === JSON.stringify(second.stableMessageIds);
    const completeMessageText = first.messages.every(row => typeof row.text === "string");
    // Only aggregate diagnostics leave this process, never transcript contents.
    console.log(JSON.stringify({ ok: idsStable && first.turnCount > 0 && first.messageCount > 0 && completeMessageText,
      source: "official-app-server", method: first.method,
      turnCount: first.turnCount, messageCount: first.messageCount, userCount: first.userCount,
      answerCount: first.answerCount, stableIdsAcrossReads: idsStable,
      contentFieldsPresent: completeMessageText }, null, 2));
    if (!idsStable || first.turnCount === 0 || first.messageCount === 0 || !completeMessageText) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "App Server read failed");
    process.exitCode = 1;
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
