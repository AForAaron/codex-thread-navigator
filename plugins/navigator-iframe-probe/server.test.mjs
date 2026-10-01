import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createProbeServer } from "./server.mjs";
import { buildThreadDirectory } from "./thread-directory.mjs";
import { searchThreadHistory } from "./thread-search.mjs";

test("official MCP Apps tool points to a readable iframe resource", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProbeServer();
  const client = new Client({ name: "navigator-probe-test", version: "0.1.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    const probe = tools.find(tool => tool.name === "show_navigator_placement_probe");
    assert.ok(probe);
    assert.equal(probe.annotations?.readOnlyHint, true);
    assert.equal(probe._meta?.ui?.resourceUri, "ui://navigator-iframe-probe/v1.html");
    const result = await client.callTool({ name: probe.name, arguments: {} });
    assert.deepEqual(result.structuredContent, { kind: "iframe-placement-probe", readsConversation: false });
    const resource = await client.readResource({ uri: probe._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /data-probe="navigator-iframe"/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("Chat capability probe exposes only its own result and documented iframe signals", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProbeServer();
  const client = new Client({ name: "chat-host-probe-test", version: "0.1.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    const probe = tools.find(tool => tool.name === "show_chat_host_capability_probe");
    assert.ok(probe);
    assert.deepEqual(probe.inputSchema.required ?? [], []);
    assert.equal(probe.annotations?.readOnlyHint, true);
    assert.equal(probe._meta?.ui?.resourceUri, "ui://navigator-iframe-probe/chat-host-v1.html");
    const result = await client.callTool({ name: probe.name, arguments: {} });
    assert.deepEqual(result.structuredContent, { kind: "chat-host-capability-probe", readsConversation: false });
    const resource = await client.readResource({ uri: probe._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /data-probe="chat-host-capabilities"/);
    assert.doesNotMatch(resource.contents[0].text, /document\.querySelector|document\.body\.innerText|localStorage|fetch\(/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("full-history search finds answer-only terms and every occurrence with stable IDs", () => {
  const result = searchThreadHistory({
    threadId: "thread_12345678", turnCount: 2, stableTurnIds: ["turn_1", "turn_2"],
    messages: [
      { turnId: "turn_1", itemId: "user_1", role: "userMessage", text: "Where is it?" },
      { turnId: "turn_1", itemId: "answer_1", role: "agentMessage", text: "Needle, then needle again." },
      { turnId: "turn_2", itemId: "answer_2", role: "agentMessage", text: "No match" },
    ],
  }, "needle");
  assert.equal(result.historyComplete, true);
  assert.equal(result.totalMatches, 2);
  assert.deepEqual(result.hits.map(({ ordinal, turnId, itemId, role, index, end }) =>
    ({ ordinal, turnId, itemId, role, index, end })), [
    { ordinal: 1, turnId: "turn_1", itemId: "answer_1", role: "assistant", index: 0, end: 6 },
    { ordinal: 1, turnId: "turn_1", itemId: "answer_1", role: "assistant", index: 13, end: 19 },
  ]);
  assert.equal(result.hits[0].snippet.includes("Needle"), true);
});

test("search reports truncation and preserves literal queries", () => {
  const history = { threadId: "thread_12345678", turnCount: 1, stableTurnIds: ["turn_1"],
    messages: [{ turnId: "turn_1", itemId: "answer_1", role: "agentMessage", text: "a+b a+b a+b" }] };
  const result = searchThreadHistory(history, "a+b", 2);
  assert.equal(result.totalMatches, 3);
  assert.equal(result.returnedHits, 2);
  assert.equal(result.resultsTruncated, true);
  assert.deepEqual(result.hits.map(hit => hit.index), [0, 4]);
  assert.throws(() => searchThreadHistory(history, " "), /Invalid search query/);
  assert.throws(() => searchThreadHistory(history, "a", 201), /Invalid search limit/);
});

test("search tool requires explicit thread ID and shows results in its iframe", async () => {
  let called = 0;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProbeServer({ searchThread: async (threadId, query) => {
    called++;
    assert.equal(threadId, "thread_12345678");
    return searchThreadHistory({ threadId, turnCount: 1, stableTurnIds: ["turn_1"],
      messages: [{ turnId: "turn_1", itemId: "answer_1", role: "agentMessage", text: "Private answer marker" }] }, query);
  } });
  const client = new Client({ name: "navigator-search-test", version: "0.1.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const invalid = await client.callTool({ name: "search_known_thread", arguments: { query: "marker" } });
    assert.equal(invalid.isError, true);
    assert.equal(called, 0);
    const result = await client.callTool({ name: "search_known_thread", arguments: { threadId: "thread_12345678", query: "marker" } });
    assert.equal(called, 1);
    assert.equal(result.structuredContent.totalMatches, 1);
    assert.equal(result.structuredContent.hits[0].itemId, "answer_1");
    assert.equal(result.content[0].text.includes("Private answer"), false);
    const { tools } = await client.listTools();
    const tool = tools.find(row => row.name === "search_known_thread");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool._meta.ui.resourceUri, "ui://navigator-iframe-probe/search-v1.html");
    const resource = await client.readResource({ uri: tool._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /ui\/notifications\/tool-result/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("read-only directory keeps stable IDs and short question titles", () => {
  const directory = buildThreadDirectory({
    threadId: "thread_12345678", method: "thread/turns/list", turnCount: 2,
    stableTurnIds: ["turn_1", "turn_2"],
    messages: [
      { turnId: "turn_1", itemId: "item_user_1", role: "userMessage", text: "First  question\nwith a second line" },
      { turnId: "turn_1", itemId: "item_answer_1", role: "agentMessage", text: "answer" },
      { turnId: "turn_2", itemId: "item_answer_2", role: "agentMessage", text: "answer only" },
    ],
  });
  assert.deepEqual(directory.entries, [
    { ordinal: 1, turnId: "turn_1", userMessageId: "item_user_1", title: "First question with a second line" },
    { ordinal: 2, turnId: "turn_2", userMessageId: null, title: "轮次 2" },
  ]);
  assert.equal(directory.complete, true);
  assert.equal(JSON.stringify(directory).includes("answer only"), false);
});

test("directory tool requires an explicit ID and returns only short titles", async () => {
  let requestedId;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProbeServer({ readDirectory: async id => {
    requestedId = id;
    return buildThreadDirectory({
      threadId: id, method: "thread/read", turnCount: 1,
      stableTurnIds: ["turn_1"],
      messages: [{ turnId: "turn_1", itemId: "item_1", role: "userMessage", text: "A private prompt" }],
    });
  } });
  const client = new Client({ name: "navigator-directory-test", version: "0.1.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const invalid = await client.callTool({ name: "list_known_thread_directory", arguments: {} });
    assert.equal(invalid.isError, true);
    assert.equal(requestedId, undefined);
    const result = await client.callTool({ name: "list_known_thread_directory", arguments: { threadId: "thread_12345678" } });
    assert.equal(requestedId, "thread_12345678");
    assert.equal(result.structuredContent.entries[0].title, "A private prompt");
    assert.equal(result.structuredContent.entries[0].turnId, "turn_1");
    assert.equal(result.content[0].text.includes("A private prompt"), false);
    const tools = await client.listTools();
    const directoryTool = tools.tools.find(tool => tool.name === "list_known_thread_directory");
    assert.equal(directoryTool._meta.ui.resourceUri, "ui://navigator-iframe-probe/directory-v1.html");
    const resource = await client.readResource({ uri: directoryTool._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /ui\/notifications\/tool-result/);
  } finally {
    await client.close();
    await server.close();
  }
});
