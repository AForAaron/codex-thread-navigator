import type { ReadingAnchor } from "../../core/src/reading/types.ts";
import type { SearchHit } from "../../core/src/search/search.ts";

export type ReadingMode = "FOLLOWING" | "READING" | "RESTORING" | "JUMPING";

/** The active prompt is the last prompt before the reading line, even inside a long answer. */
export function currentPrompt(viewport: HTMLElement): string | null {
  const line = viewport.getBoundingClientRect().top + 24;
  const users = [...viewport.querySelectorAll<HTMLElement>('[data-testid="user-message"]')];
  let selected = users[0];
  for (const user of users) {
    if (user.getBoundingClientRect().top <= line) selected = user;
    else break;
  }
  return selected?.dataset.turnId ?? null;
}

export function contentTextNodes(article: HTMLElement): Text[] {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(".cn-debug, script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}
export function messageText(article: HTMLElement): string {
  return contentTextNodes(article).map(node => node.data).join("");
}
function blocks(article: HTMLElement): HTMLElement[] {
  const nodes = [...article.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, pre, li, table, img")]
    .filter(node => !node.closest(".cn-debug") && !node.parentElement?.closest("pre, li, table"));
  return nodes.length ? nodes : [article];
}

/** Owned-container controller: never mount this on the official app without a verified adapter. */
export class ReadingViewport {
  mode: ReadingMode = "READING";
  unread = false;
  private pin: ReadingAnchor | null = null;
  private frame = 0;
  private settleFrame = 0;
  private saveTimer = 0;
  private disposed = false;
  private pendingContent = false;
  private transaction = 0;
  private mutation: MutationObserver;
  private resize: ResizeObserver;
  private observed = new Set<Element>();

  constructor(readonly viewport: HTMLElement, readonly threadId: string, private options: {
    save: (anchor: ReadingAnchor) => void;
    change: (contentChanged?: boolean) => void;
    stable: () => boolean;
  }) {
    // This container's controller owns scroll anchoring; don't also let the browser compensate.
    viewport.style.overflowAnchor = "none";
    this.resize = new ResizeObserver(() => this.schedule(false));
    this.resize.observe(viewport);
    this.mutation = new MutationObserver(() => {
      this.observeArticles();
      this.schedule(true);
    });
    this.mutation.observe(viewport, { childList: true, subtree: true, characterData: true });
    this.observeArticles();
    this.pin = this.capture();
    viewport.addEventListener("scroll", this.onScroll, { passive: true });
    viewport.addEventListener("wheel", this.onIntent, { passive: true });
    viewport.addEventListener("touchstart", this.onIntent, { passive: true });
    viewport.addEventListener("pointerdown", this.onIntent, { passive: true });
    viewport.addEventListener("keydown", this.onKey);
  }
  private observeArticles(): void {
    for (const article of this.viewport.querySelectorAll(".preview-turn")) {
      if (!this.observed.has(article)) { this.observed.add(article); this.resize.observe(article); }
    }
    for (const article of this.observed) {
      if (!article.isConnected) { this.resize.unobserve(article); this.observed.delete(article); }
    }
  }
  private find(anchor: ReadingAnchor): HTMLElement | null {
    const articles = [...this.viewport.querySelectorAll<HTMLElement>(".preview-turn")];
    const article = articles.find(node => anchor.itemId && node.dataset.itemId === anchor.itemId)
      ?? articles.find(node => node.dataset.turnId === anchor.turnId);
    if (!article) return null;
    return blocks(article)[anchor.blockIndex ?? 0] ?? article;
  }
  capture(): ReadingAnchor | null {
    const top = this.viewport.getBoundingClientRect().top;
    for (const article of this.viewport.querySelectorAll<HTMLElement>(".preview-turn")) {
      if (article.getBoundingClientRect().bottom <= top + 12) continue;
      const nodes = blocks(article);
      const index = Math.max(0, nodes.findIndex(node => node.getBoundingClientRect().bottom > top + 12));
      const node = nodes[index]!;
      return { threadId: this.threadId, turnId: article.dataset.turnId, itemId: article.dataset.itemId,
        blockHash: article.dataset.blockHash, blockIndex: index,
        viewportOffset: node.getBoundingClientRect().top - top, following: this.mode === "FOLLOWING" };
    }
    return this.pin;
  }
  private onIntent = (): void => {
    ++this.transaction;
    cancelAnimationFrame(this.settleFrame);
    this.mode = "READING";
    this.pin = this.capture();
  };
  private onKey = (event: KeyboardEvent): void => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) this.onIntent();
  };
  private onScroll = (): void => {
    if (this.disposed || this.mode === "RESTORING" || this.mode === "JUMPING") return;
    const distance = this.viewport.scrollHeight - this.viewport.clientHeight - this.viewport.scrollTop;
    this.mode = distance < 80 ? "FOLLOWING" : "READING";
    if (this.mode === "FOLLOWING") this.unread = false;
    this.pin = this.capture();
    this.options.change();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 360);
  };
  private schedule(content: boolean): void {
    this.pendingContent ||= content;
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      if (this.mode === "RESTORING" || this.mode === "JUMPING") { this.pendingContent = false; return; }
      if (this.mode === "FOLLOWING") this.viewport.scrollTop = this.viewport.scrollHeight;
      else if (this.options.stable() && this.pin) {
        const node = this.find(this.pin);
        if (node) this.viewport.scrollTop += node.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top - (this.pin.viewportOffset ?? 0);
      }
      if (this.pendingContent && this.mode === "READING") this.unread = true;
      const changed = this.pendingContent;
      this.pendingContent = false;
      this.options.change(changed);
    });
  }
  private position(node: HTMLElement, mode: "RESTORING" | "JUMPING", offset = 0, following = false): void {
    const token = ++this.transaction;
    this.mode = mode;
    clearTimeout(this.saveTimer);
    cancelAnimationFrame(this.settleFrame);
    const apply = () => {
      if (following) this.viewport.scrollTop = this.viewport.scrollHeight;
      else this.viewport.scrollTop += node.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top - offset;
    };
    apply();
    // Wait for two layout frames; input or disposal cancels the entire transaction.
    this.settleFrame = requestAnimationFrame(() => {
      if (token !== this.transaction || this.disposed) return;
      apply();
      this.settleFrame = requestAnimationFrame(() => {
        if (token !== this.transaction || this.disposed) return;
        apply(); this.mode = following ? "FOLLOWING" : "READING";
        if (following) this.unread = false;
        this.pin = this.capture(); this.options.change(); this.flush();
      });
    });
  }
  jump(node: HTMLElement): void { this.position(node, "JUMPING"); }
  latest(): void { this.position(this.viewport, "JUMPING", 0, true); }
  restore(anchor: ReadingAnchor): boolean {
    const target = this.find(anchor);
    if (!target) return false;
    // v2 absolute offsets are deliberately ignored; old anchors fall back to message start.
    this.position(target, "RESTORING", anchor.viewportOffset ?? 0, anchor.following ?? false);
    return true;
  }
  flush(): void {
    if (this.disposed || this.mode === "RESTORING" || this.mode === "JUMPING") return;
    const anchor = this.capture(); if (anchor) this.options.save(anchor);
  }
  revealHit(hit: SearchHit): boolean {
    const article = [...this.viewport.querySelectorAll<HTMLElement>(".preview-turn")].find(node =>
      hit.itemId ? node.dataset.itemId === hit.itemId : node.dataset.turnId === hit.turnId);
    if (!article) return false;
    const nodes = contentTextNodes(article);
    const range = document.createRange();
    let count = 0, started = false, ended = false;
    for (const node of nodes) {
      if (!started && hit.index < count + node.length) { range.setStart(node, hit.index - count); started = true; }
      if (started && hit.end <= count + node.length) { range.setEnd(node, hit.end - count); ended = true; break; }
      count += node.length;
    }
    if (!started || !ended) return false;
    const target = range.startContainer.parentElement?.closest<HTMLElement>("p,li,pre,h1,h2,h3,h4") ?? article;
    const rangeOffset = range.getBoundingClientRect().top - target.getBoundingClientRect().top;
    this.position(target, "JUMPING", -Math.max(0, rangeOffset));
    const api = globalThis as unknown as { Highlight?: new (range: Range) => unknown; CSS: { highlights?: Map<string, unknown> } };
    if (api.Highlight && api.CSS.highlights) api.CSS.highlights.set("navigator-search", new api.Highlight(range));
    article.dataset.searchMatch = `${hit.index}:${hit.end}`;
    return true;
  }
  dispose(): void {
    this.flush(); this.disposed = true; ++this.transaction;
    cancelAnimationFrame(this.frame); cancelAnimationFrame(this.settleFrame); clearTimeout(this.saveTimer);
    this.mutation.disconnect(); this.resize.disconnect(); this.observed.clear();
    this.viewport.removeEventListener("scroll", this.onScroll);
    this.viewport.removeEventListener("wheel", this.onIntent);
    this.viewport.removeEventListener("touchstart", this.onIntent);
    this.viewport.removeEventListener("pointerdown", this.onIntent);
    this.viewport.removeEventListener("keydown", this.onKey);
  }
}
