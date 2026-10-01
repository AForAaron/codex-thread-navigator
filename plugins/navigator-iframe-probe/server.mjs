import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { readKnownThreadDirectory } from "./thread-directory.mjs";
import { searchKnownThread } from "./thread-search.mjs";

const widget = readFileSync(new URL("./widget.html", import.meta.url), "utf8");
const UI_URI = "ui://navigator-iframe-probe/v1.html";
const directoryWidget = readFileSync(new URL("./directory-widget.html", import.meta.url), "utf8");
const DIRECTORY_UI_URI = "ui://navigator-iframe-probe/directory-v1.html";
const searchWidget = readFileSync(new URL("./search-widget.html", import.meta.url), "utf8");
const SEARCH_UI_URI = "ui://navigator-iframe-probe/search-v1.html";
const chatHostWidget = readFileSync(new URL("./chat-host-probe.html", import.meta.url), "utf8");
const CHAT_HOST_UI_URI = "ui://navigator-iframe-probe/chat-host-v1.html";
export const PROBE_PORT = Number(process.env.CODEX_NAV_PROBE_PORT || 8879);

export function createProbeServer({ readDirectory = readKnownThreadDirectory, searchThread = searchKnownThread } = {}) {
  const server = new McpServer({ name: "navigator-iframe-probe", version: "0.1.0" });
  registerAppResource(server, "navigator-placement", UI_URI, {}, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: widget }],
  }));
  registerAppResource(server, "known-thread-directory", DIRECTORY_UI_URI, {}, async () => ({
    contents: [{ uri: DIRECTORY_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: directoryWidget }],
  }));
  registerAppResource(server, "known-thread-search", SEARCH_UI_URI, {}, async () => ({
    contents: [{ uri: SEARCH_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: searchWidget }],
  }));
  registerAppResource(server, "chat-host-capabilities", CHAT_HOST_UI_URI, {}, async () => ({
    contents: [{ uri: CHAT_HOST_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: chatHostWidget }],
  }));
  registerAppTool(server, "show_chat_host_capability_probe", {
    title: "Show Chat host capability probe",
    description: "Show a read-only plugin UI card that checks documented iframe bridge signals. It reads no conversation, does not inspect host DOM, and cannot control host scrolling.",
    inputSchema: {},
    outputSchema: { kind: z.literal("chat-host-capability-probe"), readsConversation: z.literal(false) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: CHAT_HOST_UI_URI } },
  }, async () => ({
    content: [{ type: "text", text: "Chat host capability probe ready. It tests only documented plugin iframe signals and reads no conversation." }],
    structuredContent: { kind: "chat-host-capability-probe", readsConversation: false },
  }));
  registerAppTool(server, "show_navigator_placement_probe", {
    title: "Show navigator iframe placement probe",
    description: "Display a static UI placement probe. It reads no conversation content and changes no host UI.",
    inputSchema: {},
    outputSchema: { kind: z.literal("iframe-placement-probe"), readsConversation: z.literal(false) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  }, async () => ({
    content: [{ type: "text", text: "Navigator iframe placement probe ready. The card is confined to the plugin UI surface." }],
    structuredContent: { kind: "iframe-placement-probe", readsConversation: false },
  }));
  registerAppTool(server, "list_known_thread_directory", {
    title: "List a known Codex thread's turns",
    description: "Read the complete turn IDs and short user-question titles for an explicitly supplied local Codex thread ID. Does not identify the current thread or scroll the host UI.",
    inputSchema: { threadId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: DIRECTORY_UI_URI } },
  }, async ({ threadId }) => {
    try {
      const directory = await readDirectory(threadId);
      return {
        content: [{ type: "text", text: `Read ${directory.turnCount} turns for the explicitly supplied Codex thread. The full short-title directory is in structuredContent; no native host navigation was performed.` }],
        structuredContent: directory,
      };
    } catch {
      // App Server errors can contain local paths or item details; keep them out of tool output.
      return { isError: true, content: [{ type: "text", text: "Unable to read this Codex thread through the read-only App Server. No host UI was changed." }] };
    }
  });
  registerAppTool(server, "search_known_thread", {
    title: "Search a known Codex thread",
    description: "Search all loaded history from an explicitly supplied local Codex thread ID, including user questions and assistant answers. Returns matching snippets in a tool card. Does not identify the current thread or scroll the host UI.",
    inputSchema: {
      threadId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
      query: z.string().trim().min(1).max(200),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: SEARCH_UI_URI } },
  }, async ({ threadId, query }) => {
    try {
      const result = await searchThread(threadId, query);
      return {
        content: [{ type: "text", text: `Searched ${result.turnCount} turns in the explicitly supplied Codex thread. Found ${result.totalMatches} matches; returned ${result.returnedHits}. Results are in the tool card. No native host navigation was performed.` }],
        structuredContent: result,
      };
    } catch {
      return { isError: true, content: [{ type: "text", text: "Unable to search this Codex thread through the read-only App Server. Results are unavailable and no host UI was changed." }] };
    }
  });
  return server;
}

export function createProbeHttpServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      return;
    }
    if (url.pathname === "/widget" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(widget);
      return;
    }
    if (url.pathname !== "/mcp" || !["POST", "GET", "DELETE"].includes(req.method || "")) {
      res.writeHead(404).end("Not Found");
      return;
    }
    const server = createProbeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500).end("Probe MCP error");
      // Do not log request bodies or user data.
      if (process.env.CODEX_NAV_PROBE_DEBUG === "1") console.error(error instanceof Error ? error.message : "MCP error");
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const server = createProbeHttpServer();
  server.listen(PROBE_PORT, "127.0.0.1", () => {
    console.log(`Navigator probe listening on http://127.0.0.1:${PROBE_PORT}/mcp`);
  });
}
