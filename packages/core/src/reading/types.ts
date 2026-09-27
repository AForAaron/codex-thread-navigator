import type { ConversationIdentity } from "../navigation/host.js";

export type RestoreTier = "turn+item+block" | "turn+item" | "turn" | "none";

export interface ReadingAnchor {
  threadId: string;
  /** v4: explicit surface/branch/window; absent on legacy anchors. */
  identity?: ConversationIdentity;
  turnId?: string;
  itemId?: string;
  itemIndex?: number;
  blockHash?: string;
  contentHash?: string;
  offset?: number;
  /** v3: position within a message, relative to the viewport (never absolute scrollTop). */
  blockIndex?: number;
  viewportOffset?: number;
  following?: boolean;
}

export interface RestoreCandidate {
  turnId: string;
  itemId?: string;
  itemIndex?: number;
  blockHash?: string;
}

export type RestoreResult =
  | { ok: true; candidate: RestoreCandidate; tier: Exclude<RestoreTier, "none"> }
  | { ok: false; tier: "none" };
