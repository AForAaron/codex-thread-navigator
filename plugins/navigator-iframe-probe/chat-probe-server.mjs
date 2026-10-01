import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const widget = readFileSync(new URL("./chat-host-probe.html", import.meta.url), "utf8");
const UI_URI = "ui://navigator-chat-host-probe/v1.html";
export const CHAT_PROBE_PORT = Number(process.env.CODEX_NAV_CHAT_PROBE_PORT || 8880);

/** Public-development probe: intentionally has no history or filesystem tools. */
export function createChatProbeServer() {
  const server = new McpServer({ name: "navigator-chat-host-probe", version: "0.1.0" });
  registerAppResource(server, "chat-host-capabilities", UI_URI, {}, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: widget }],
  }));
  registerAppTool(server, "show_chat_host_capability_probe", {
    title: "Show Chat host capability probe",
    description: "Show a static read-only plugin card for documented iframe signals. Reads no conversation, filesystem, or host DOM and performs no host scrolling.",
    inputSchema: {},
    outputSchema: { kind: z.literal("chat-host-capability-probe"), readsConversation: z.literal(false) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  }, async () => ({
    content: [{ type: "text", text: "Chat host capability probe ready. No conversation or local files were read." }],
    structuredContent: { kind: "chat-host-capability-probe", readsConversation: false },
  }));
  return server;
}

export function createChatProbeHttpServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      return;
    }
    if (url.pathname !== "/mcp" || !["POST", "GET", "DELETE"].includes(req.method || "")) {
      res.writeHead(404).end("Not Found");
      return;
    }
    const server = createChatProbeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end("Chat probe MCP error");
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createChatProbeHttpServer().listen(CHAT_PROBE_PORT, "127.0.0.1", () => {
    console.log(`Chat-only navigator probe listening on http://127.0.0.1:${CHAT_PROBE_PORT}/mcp`);
  });
}
