import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createChatProbeServer } from "./chat-probe-server.mjs";

test("Chat-only probe advertises no local history tools or inputs", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createChatProbeServer();
  const client = new Client({ name: "chat-probe-test", version: "0.1.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ["show_chat_host_capability_probe"]);
    const tool = tools[0];
    assert.deepEqual(tool.inputSchema.required ?? [], []);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool._meta.ui.resourceUri, "ui://navigator-chat-host-probe/v1.html");
    const result = await client.callTool({ name: tool.name, arguments: {} });
    assert.deepEqual(result.structuredContent, { kind: "chat-host-capability-probe", readsConversation: false });
    const resource = await client.readResource({ uri: tool._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /data-probe="chat-host-capabilities"/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("Chat-only stdio entry advertises the same single no-data tool", async () => {
  const client = new Client({ name: "chat-probe-stdio-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./chat-probe-stdio.mjs", import.meta.url))],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ["show_chat_host_capability_probe"]);
  } finally {
    await client.close();
  }
});
