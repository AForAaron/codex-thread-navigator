import type { ReadingAnchor } from "../reading/types.js";
import type { SearchableTurn } from "../search/search.js";

export interface ConversationIdentity {
  surface: "chat" | "codex";
  threadId: string;
  branchId: string;
  windowId: string;
}

export function identityKey(identity: ConversationIdentity): string {
  return JSON.stringify([identity.surface, identity.threadId, identity.branchId, identity.windowId]);
}

export interface HistoryMessage extends SearchableTurn {
  itemId: string;
}

export interface HistoryPage {
  messages: readonly HistoryMessage[];
  nextCursor: string | null;
  /** Host must explicitly attest to full displayed-branch coverage. */
  coverage: "partial" | "complete";
}

export interface NavigationTarget {
  turnId: string;
  itemId: string;
  range?: { start: number; end: number };
}

/** Implement only after host capabilities are verified. No guessed selectors. */
export interface ConversationHost {
  readonly identity: Readonly<ConversationIdentity>;
  readonly compensationOwner: "native" | "extension";
  readHistoryPage(cursor: string | null, signal: AbortSignal): Promise<HistoryPage>;
  ensureTargetLoaded(target: NavigationTarget, signal: AbortSignal): Promise<void>;
  revealTarget(target: NavigationTarget, signal: AbortSignal): Promise<void>;
  captureAnchor(): ReadingAnchor | null;
  restoreAnchor(anchor: ReadingAnchor, signal: AbortSignal): Promise<void>;
  /** Resolve only after target geometry is stable; abort on user intent. */
  waitForLayout(signal: AbortSignal): Promise<void>;
  subscribeIdentity(listener: (identity: ConversationIdentity) => void): () => void;
  subscribeContent(listener: (messages: readonly HistoryMessage[]) => void): () => void;
  subscribeLayout(listener: () => void): () => void;
  subscribeUserIntent(listener: () => void): () => void;
  dispose(): void;
}
