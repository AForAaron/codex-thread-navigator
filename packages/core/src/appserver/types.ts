import type { Capability } from "../capability.js";

/** Index record only. The `title` field is a short label, never the full prompt. */
export interface UserTurnIndex {
  threadId: string;
  turnId: string;
  itemId?: string;
  ordinal: number;
  title: string;
  contentHash: string;
}

export interface AppServerThreadRef {
  threadId: string;
  conversationId?: string;
}

/**
 * AppServer-facing client.
 *
 * Documented Explodex bridge methods (sdk-api.md):
 *   bridge.isAvailable(), bridge.send(type, payload), bridge.rpc(method, params),
 *   bridge.navigate(path), codex.getThreadConversation(conversationId)
 *
 * Documented turn-related message types:
 *   update-thread-settings-for-next-turn
 *   start-turn-for-host
 *
 * The official Codex App Server documents thread/read(includeTurns) and
 * experimental thread/turns/list(itemsView=full) for a known thread id.
 * This Explodex-facing interface has not verified that its bridge can relay
 * those JSON-RPC methods to the desktop app, nor can it identify the current
 * in-view thread. Those unverified operations return UNVERIFIED_RPC.
 */
export interface AppServerClient {
  readonly kind: "explodex-bridge" | "unavailable";
  isAvailable(): boolean;
  getCurrentThreadId(): Promise<Capability<AppServerThreadRef>>;
  getCurrentTurnId(): Promise<Capability<string>>;
  listUserTurns(threadId: string): Promise<Capability<UserTurnIndex[]>>;
  /**
   * Only call documented types. Unknown types are rejected locally
   * so we do not probe undocumented RPCs against a live Codex session.
   */
  sendDocumented(type: DocumentedAppServerType, payload?: Record<string, unknown>): Promise<Capability<unknown>>;
}

export const DOCUMENTED_APPSERVER_TYPES = [
  "update-thread-settings-for-next-turn",
  "start-turn-for-host",
  "get-setting",
  "set-setting",
  "get-global-state",
  "set-global-state",
  "navigate-to-route",
] as const;

export type DocumentedAppServerType = (typeof DOCUMENTED_APPSERVER_TYPES)[number];

export function isDocumentedAppServerType(type: string): type is DocumentedAppServerType {
  return (DOCUMENTED_APPSERVER_TYPES as readonly string[]).includes(type);
}
