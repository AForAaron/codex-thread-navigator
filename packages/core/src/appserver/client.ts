import { unavailable, type Capability } from "../capability.js";
import {
  isDocumentedAppServerType,
  type AppServerClient,
  type AppServerThreadRef,
  type DocumentedAppServerType,
  type UserTurnIndex,
} from "./types.js";

/**
 * Used when Explodex is not injected. Honest: nothing is available.
 */
export class UnavailableAppServerClient implements AppServerClient {
  readonly kind = "unavailable" as const;

  isAvailable(): boolean {
    return false;
  }

  async getCurrentThreadId(): Promise<Capability<AppServerThreadRef>> {
    return unavailable(
      "AppServer bridge is not present. Thread id must come from the DOM adapter (route /thread/:id) once Explodex is injected.",
      "BRIDGE_MISSING",
      "appserver-bridge",
    );
  }

  async getCurrentTurnId(): Promise<Capability<string>> {
    return unavailable(
      "No documented AppServer method returns the current turnId.",
      "UNVERIFIED_RPC",
      "appserver-bridge",
    );
  }

  async listUserTurns(_threadId: string): Promise<Capability<UserTurnIndex[]>> {
    return unavailable(
      "No documented AppServer RPC lists user turns. Use DomAdapter.listUserPrompts() after selectors are verified on this Codex build.",
      "UNVERIFIED_RPC",
      "appserver-bridge",
    );
  }

  async sendDocumented(
    type: DocumentedAppServerType,
    _payload?: Record<string, unknown>,
  ): Promise<Capability<unknown>> {
    if (!isDocumentedAppServerType(type)) {
      return unavailable(`Refusing undocumented AppServer type: ${String(type)}`, "UNVERIFIED_RPC", "appserver-bridge");
    }
    return unavailable(
      `Explodex bridge is not present; cannot send documented type '${type}'.`,
      "BRIDGE_MISSING",
      "appserver-bridge",
    );
  }
}

export function createUnavailableAppServerClient(): AppServerClient {
  return new UnavailableAppServerClient();
}
