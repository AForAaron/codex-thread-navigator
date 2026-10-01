import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createChatProbeServer } from "./chat-probe-server.mjs";

const server = createChatProbeServer();
await server.connect(new StdioServerTransport());
