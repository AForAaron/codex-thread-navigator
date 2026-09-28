import { ok, unavailable, type Capability } from "../capability.js";
import {
  isDocumentedAppServerType,
  type AppServerClient,
  type AppServerThreadRef,
  type DocumentedAppServerType,
  type UserTurnIndex,
} from "./types.js";

/**
 * Minimal subset of Explodex PluginAPI used here.
 * Kept local so core does not depend on the full vendor .d.ts at runtime.
 * Signatures match vendor/explodex-sdk/explodex-sdk.d.ts BridgeAPI / CodexAPI.
 */
export interface ExplodexBridgeLike {
  isAvailable(): boolean;
  send(type: string, payload?: Record<string, unknown>): Promise<unknown | null | undefined>;
  rpc?(method: string, params?: Record<string, unknown>): Promise<unknown | null>;
  navigate?(path: string, state?: Record<string, unknown>): Promise<unknown | null | undefined>;
}

export interface ExplodexCodexLike {
  getThreadConversation(conversationId: string): { id: string } | null;
}

export interface ExplodexRuntimeLike {
  bridge?: ExplodexBridgeLike;
  codex?: ExplodexCodexLike;
}

/**
 * Wraps a live Explodex `api` when injection actually happened.
 * Does not invent RPCs. Thread discovery still belongs to the DOM adapter.
 */
export class ExplodexAppServerClient implements AppServerClient {
  readonly kind = "explodex-bridge" as const;

  constructor(private readonly runtime: ExplodexRuntimeLike) {}

  isAvailable(): boolean {
    return this.runtime.bridge?.isAvailable() === true;
  }

  async getCurrentThreadId(): Promise<Capability<AppServerThreadRef>> {
    return unavailable(
      "Explodex CodexAPI.getThreadConversation(id) requires an id you already have. There is no documented AppServer call to discover the current threadId. Use DomAdapter.getCurrentThreadId().",
      "UNVERIFIED_RPC",
      "appserver-bridge",
    );
  }

  async getCurrentTurnId(): Promise<Capability<string>> {
    return unavailable(
      "No documented AppServer / Explodex method returns the in-view turnId.",
      "UNVERIFIED_RPC",
      "appserver-bridge",
    );
  }

  async listUserTurns(_threadId: string): Promise<Capability<UserTurnIndex[]>> {
    return unavailable(
      "Official App Server has thread/read(includeTurns), but forwarding it through this Explodex bridge and mapping items is unverified. Do not send speculative calls against a live session.",
      "UNVERIFIED_RPC",
      "appserver-bridge",
    );
  }

  /**
   * Look up a conversation object only when the caller already has the id
   * (documented: api.codex.getThreadConversation).
   */
  getThreadConversation(conversationId: string): Capability<{ id: string }> {
    const found = this.runtime.codex?.getThreadConversation(conversationId) ?? null;
    if (!found) {
      return unavailable(
        "codex.getThreadConversation returned null (fiber walk missed or id unknown).",
        "NOT_FOUND",
        "appserver-bridge",
      );
    }
    return ok({ id: found.id }, "appserver-bridge");
  }

  async sendDocumented(
    type: DocumentedAppServerType,
    payload?: Record<string, unknown>,
  ): Promise<Capability<unknown>> {
    if (!isDocumentedAppServerType(type)) {
      return unavailable(`Refusing undocumented AppServer type: ${String(type)}`, "UNVERIFIED_RPC", "appserver-bridge");
    }
    const bridge = this.runtime.bridge;
    if (!bridge?.isAvailable()) {
      return unavailable("Explodex bridge.isAvailable() is false.", "BRIDGE_MISSING", "appserver-bridge");
    }
    try {
      const result = await bridge.send(type, payload);
      return ok(result, "appserver-bridge");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unavailable(`bridge.send('${type}') failed: ${message}`, "UNAVAILABLE", "appserver-bridge");
    }
  }
}

export function createExplodexAppServerClient(runtime: ExplodexRuntimeLike): AppServerClient {
  return new ExplodexAppServerClient(runtime);
}
