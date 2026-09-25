import type { Capability } from "../capability.js";
import type { UserTurnIndex } from "../appserver/types.js";

export interface PromptScanItem extends UserTurnIndex {
  itemIndex?: number;
  blockHash?: string;
  /** In-memory only. Never persisted. */
  element?: Element;
}

/**
 * DOM adapter contract. Prompt jump goes through this, not through fake lists.
 */
export interface DomAdapter {
  readonly id: "codex-current";
  readonly selectorPack: SelectorPack;
  getCurrentThreadId(): Capability<string>;
  listUserPrompts(): Promise<Capability<PromptScanItem[]>>;
  jumpToPrompt(target: {
    turnId?: string;
    itemId?: string;
    itemIndex?: number;
    blockHash?: string;
    contentHash?: string;
  }): Capability<true>;
  jumpToLatest(): Capability<true>;
  getScrollOffset(): Capability<number>;
  getScannedPrompts(): PromptScanItem[];
  /**
   * Viewport lock. Desktop/default must be a no-op.
   * Only a preview-gated implementation may compensate scroll.
   */
  lockViewport?(enabled: boolean): Capability<true>;
}

export interface SelectorPack {
  /** Explodex architecture doc version these selectors were taken from. */
  documentedAgainst: string;
  /** Local Codex / ChatGPT.app version these selectors were verified on. null = not verified. */
  verifiedOn: string | null;
  threadRoute: string;
  leftPanelFloating: string;
  leftPanelDocked: string;
  mainViewport: string;
  mainFrame: string;
  threadFooter: string;
  aboveComposer: string;
  composerInput: string;
  userTurnCandidates: readonly string[];
  turnIdAttrs: readonly string[];
  itemIdAttrs: readonly string[];
  itemIndexAttrs: readonly string[];
  blockHashAttrs: readonly string[];
}
