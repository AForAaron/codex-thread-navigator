/**
 * Capability-style results. Never pretend AppServer/DOM succeeded.
 */
export type Capability<T> =
  | { ok: true; value: T; source: CapabilitySource }
  | { ok: false; code: CapabilityCode; message: string; source: CapabilitySource };

export type CapabilitySource =
  | "appserver-bridge"
  | "dom-adapter"
  | "sqlite"
  | "unavailable";

export type CapabilityCode =
  | "UNAVAILABLE"
  | "UNVERIFIED_RPC"
  | "BRIDGE_MISSING"
  | "SELECTOR_UNVERIFIED"
  | "NOT_FOUND"
  | "DISABLED"
  | "INVALID_ARGUMENT";

export function unavailable<T = never>(
  message: string,
  code: CapabilityCode = "UNAVAILABLE",
  source: CapabilitySource = "unavailable",
): Capability<T> {
  return { ok: false, code, message, source };
}

export function ok<T>(value: T, source: CapabilitySource): Capability<T> {
  return { ok: true, value, source };
}
