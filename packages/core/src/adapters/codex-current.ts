import { ok, unavailable, type Capability } from "../capability.js";
import { sha256Hex, truncatePromptTitle } from "../hash.js";
import { restoreReadingPosition } from "../reading/restore.js";
import { viewportLockAllowed, type ViewportLockGate } from "../follow/follow.js";
import type { DomAdapter, PromptScanItem, SelectorPack } from "./types.js";

/**
 * Selectors collected from Explodex docs (Codex Desktop v26.623.31921).
 * This machine runs ChatGPT.app 26.908.40834 (same bundle id com.openai.codex).
 * Treat every selector as a candidate until a later phase probes a disposable window.
 */
export const CODEX_CURRENT_SELECTORS: SelectorPack = {
  documentedAgainst: "explodex-docs Codex.app v26.623.31921 build 4452",
  verifiedOn: null,
  threadRoute: String.raw`/thread/([^/?#]+)`,
  leftPanelFloating: '[data-testid="app-shell-floating-left-panel"]',
  leftPanelDocked: "aside.app-shell-left-panel",
  mainViewport: ".app-shell-main-content-viewport",
  mainFrame: ".app-shell-main-content-frame",
  threadFooter: '[data-thread-scroll-footer="true"]',
  aboveComposer: "[data-above-composer-portal]",
  composerInput: ".ProseMirror",
  userTurnCandidates: [
    '[data-testid="user-message"]',
    '[data-message-author="user"]',
    '[data-role="user"]',
    '[data-turn-role="user"]',
    '[data-testid="thread-user-turn"]',
  ],
  turnIdAttrs: ["data-turn-id", "data-thread-turn-id", "data-turnid"],
  itemIdAttrs: ["data-item-id", "data-thread-item-id", "data-itemid"],
  itemIndexAttrs: ["data-item-index"],
  blockHashAttrs: ["data-block-hash"],
};

export interface AdapterDom {
  querySelectorAll(selectors: string): Iterable<Element> | ArrayLike<Element>;
  querySelector(selectors: string): Element | null;
}

export interface AdapterLocation {
  pathname: string;
  href: string;
}

export function parseThreadIdFromPath(pathname: string, pattern = CODEX_CURRENT_SELECTORS.threadRoute): string | null {
  const match = pathname.match(new RegExp(pattern));
  return match?.[1] ?? null;
}

function readAttr(el: Element, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value) return value;
  }
  return undefined;
}

function toArray(nodes: Iterable<Element> | ArrayLike<Element>): Element[] {
  return Array.from(nodes as ArrayLike<Element>);
}

function promptVisibleText(el: Element): string {
  if (typeof el.cloneNode === "function") {
    const clone = el.cloneNode(true) as Element;
    if (typeof clone.querySelectorAll === "function") {
      for (const debug of Array.from(clone.querySelectorAll(".cn-debug"))) debug.remove();
    }
    return (clone.textContent ?? "").trim();
  }
  return (el.textContent ?? "").trim();
}

export class CodexCurrentAdapter implements DomAdapter {
  readonly id = "codex-current" as const;
  readonly selectorPack = CODEX_CURRENT_SELECTORS;
  private lastScan: PromptScanItem[] = [];

  constructor(
    private readonly dom: AdapterDom,
    private readonly location: AdapterLocation,
    private readonly lockGate: ViewportLockGate = "desktop",
  ) {}

  getCurrentThreadId(): Capability<string> {
    const id = parseThreadIdFromPath(this.location.pathname);
    if (!id) {
      return unavailable(
        `No /thread/:id in location '${this.location.pathname}'.`,
        "NOT_FOUND",
        "dom-adapter",
      );
    }
    return ok(id, "dom-adapter");
  }

  async listUserPrompts(): Promise<Capability<PromptScanItem[]>> {
    if (!this.selectorPack.verifiedOn) {
      // Still scan candidates so the interface is real; report unverified if nothing matches.
    }
    const thread = this.getCurrentThreadId();
    const threadId = thread.ok ? thread.value : "unknown-thread";
    const seen = new Set<Element>();
    const items: PromptScanItem[] = [];

    for (const selector of this.selectorPack.userTurnCandidates) {
      for (const el of toArray(this.dom.querySelectorAll(selector))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const text = promptVisibleText(el);
        const title = truncatePromptTitle(text) ?? `Prompt ${items.length + 1}`;
        const contentHash = await sha256Hex(text);
        const turnId = readAttr(el, this.selectorPack.turnIdAttrs) ?? `dom-${items.length + 1}`;
        const itemId = readAttr(el, this.selectorPack.itemIdAttrs);
        const itemIndexRaw = readAttr(el, this.selectorPack.itemIndexAttrs);
        const itemIndex = itemIndexRaw != null && itemIndexRaw !== "" ? Number(itemIndexRaw) : items.length;
        const blockHash = readAttr(el, this.selectorPack.blockHashAttrs) ?? contentHash;
        items.push({
          threadId,
          turnId,
          itemId,
          itemIndex,
          ordinal: items.length,
          title,
          contentHash,
          blockHash,
          element: el,
        });
      }
    }

    this.lastScan = items;
    if (items.length === 0) {
      return unavailable(
        `No user-turn nodes matched candidate selectors. Pack documented against ${this.selectorPack.documentedAgainst}; verifiedOn=${String(this.selectorPack.verifiedOn)}.`,
        "SELECTOR_UNVERIFIED",
        "dom-adapter",
      );
    }
    return ok(items, "dom-adapter");
  }

  jumpToPrompt(target: {
    turnId?: string;
    itemId?: string;
    itemIndex?: number;
    blockHash?: string;
    contentHash?: string;
  }): Capability<true> {
    const restored = restoreReadingPosition(
      {
        threadId: "adapter",
        turnId: target.turnId,
        itemId: target.itemId,
        itemIndex: target.itemIndex,
        blockHash: target.blockHash ?? target.contentHash,
      },
      this.lastScan,
    );
    const found = restored.ok
      ? this.lastScan.find(
          (item) =>
            item.turnId === restored.candidate.turnId &&
            item.itemId === restored.candidate.itemId &&
            item.blockHash === restored.candidate.blockHash,
        )
      : this.lastScan.find((item) => item.contentHash && item.contentHash === target.contentHash);
    if (!found?.element) {
      return unavailable(
        "Prompt node is not in the last scan. Call listUserPrompts() first; do not invent rows.",
        "NOT_FOUND",
        "dom-adapter",
      );
    }
    if (typeof found.element.scrollIntoView === "function") {
      found.element.scrollIntoView({ block: "start", behavior: "auto" });
    }
    return ok(true, "dom-adapter");
  }

  getScannedPrompts(): PromptScanItem[] {
    return this.lastScan.slice();
  }

  jumpToLatest(): Capability<true> {
    const last = this.lastScan.at(-1);
    if (!last) {
      return unavailable("No scanned prompts to jump to.", "NOT_FOUND", "dom-adapter");
    }
    return this.jumpToPrompt({ turnId: last.turnId, itemId: last.itemId, contentHash: last.contentHash });
  }

  getScrollOffset(): Capability<number> {
    const viewport = this.dom.querySelector(this.selectorPack.mainViewport);
    if (viewport && "scrollTop" in viewport) {
      return ok(Number((viewport as HTMLElement).scrollTop), "dom-adapter");
    }
    return unavailable("Main viewport selector did not resolve.", "SELECTOR_UNVERIFIED", "dom-adapter");
  }

  lockViewport(_enabled: boolean): Capability<true> {
    if (!viewportLockAllowed(this.lockGate)) {
      return unavailable(
        "Viewport lock is preview-only. Desktop adapter leaves Codex scrolling untouched.",
        "DISABLED",
        "dom-adapter",
      );
    }
    return ok(true, "dom-adapter");
  }
}

export function createCodexCurrentAdapter(
  dom: AdapterDom,
  location: AdapterLocation,
  lockGate: ViewportLockGate = "desktop",
): DomAdapter {
  return new CodexCurrentAdapter(dom, location, lockGate);
}
