import { searchTurns, type SearchHit } from "../search/search.js";
import type { ReadingAnchor } from "../reading/types.js";
import { identityKey, type ConversationHost, type ConversationIdentity, type HistoryMessage, type NavigationTarget } from "./host.js";

type Lane = "history" | "movement";
export type NavigationMode = "FOLLOWING" | "READING" | "RESTORING" | "JUMPING";
export type HistoryStatus = "partial" | "loading" | "complete" | "failed";
interface Ticket { signal: AbortSignal; current(): boolean }

/** Owns current-branch text in memory; never persists message bodies. */
export class NavigationSession {
  private host: ConversationHost | null = null;
  private identity: ConversationIdentity | null = null;
  private generation = 0;
  private readonly tasks = new Map<Lane, AbortController>();
  private readonly messages = new Map<string, HistoryMessage>();
  private cleanup: (() => void)[] = [];
  private status: HistoryStatus = "partial";
  private mode: NavigationMode = "READING";
  private failure: string | null = null;
  private revision = 0;
  private readonly revisions = new Map<string, number>();

  attach(host: ConversationHost): void {
    if (this.host === host) return;
    this.detach();
    this.host = host;
    this.identity = { ...host.identity };
    this.cleanup.push(host.subscribeUserIntent(() => {
      this.cancel("movement");
      this.mode = "READING";
    }));
    this.cleanup.push(host.subscribeContent(rows => {
      if (this.host === host) this.upsert(rows);
    }));
    this.cleanup.push(host.subscribeIdentity(identity => {
      if (this.identity && identityKey(identity) !== identityKey(this.identity)) this.detach();
    }));
  }

  detach(): void {
    ++this.generation;
    for (const controller of this.tasks.values()) controller.abort();
    this.tasks.clear();
    for (const stop of this.cleanup.splice(0)) stop();
    const previous = this.host;
    this.host = null;
    this.identity = null;
    this.messages.clear();
    this.revisions.clear();
    this.revision = 0;
    this.status = "partial";
    this.failure = null;
    this.mode = "READING";
    previous?.dispose();
  }

  snapshot(): { identity: ConversationIdentity | null; status: HistoryStatus; messageCount: number; mode: NavigationMode; error: string | null } {
    return { identity: this.identity ? { ...this.identity } : null, status: this.status,
      messageCount: this.messages.size, mode: this.mode, error: this.failure };
  }

  search(query: string): { hits: SearchHit[]; complete: boolean; status: HistoryStatus } {
    return { hits: searchTurns([...this.messages.values()], query, Number.MAX_SAFE_INTEGER),
      complete: this.status === "complete", status: this.status };
  }

  async loadHistory(): Promise<boolean> {
    const host = this.host;
    if (!host) return false;
    const ticket = this.begin("history");
    this.status = "loading";
    this.failure = null;
    let cursor: string | null = null;
    const cursors = new Set<string>();
    const staged = new Map<string, HistoryMessage>();
    const startRevision = this.revision;
    try {
      do {
        const page = await host.readHistoryPage(cursor, ticket.signal);
        if (!ticket.current()) return false;
        for (const row of page.messages) {
          if (!row.itemId || !row.turnId) throw new Error("History has no stable message identity");
          staged.set(row.itemId, { ...row });
        }
        if (page.coverage === "complete" && page.nextCursor !== null) throw new Error("Conflicting history coverage");
        if (page.nextCursor === null) {
          // A complete reload replaces stale history, while keeping newer live revisions.
          const live = [...this.messages].filter(([id]) => (this.revisions.get(id) ?? 0) > startRevision);
          if (page.coverage === "complete") this.messages.clear();
          for (const [id, row] of staged) this.messages.set(id, row);
          for (const [id, row] of live) this.messages.set(id, row);
          this.status = page.coverage === "complete" ? "complete" : "partial";
          return this.status === "complete";
        }
        if (cursors.has(page.nextCursor)) throw new Error("Repeated history cursor");
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (ticket.current());
    } catch (error) {
      if (ticket.current()) {
        for (const [id, row] of staged) if (!this.messages.has(id)) this.messages.set(id, row);
        this.status = "failed";
        this.failure = error instanceof Error ? error.message : "History load failed";
      }
    }
    return false;
  }

  async jump(target: NavigationTarget): Promise<boolean> {
    const host = this.host;
    if (!host || !target.itemId || !target.turnId) return false;
    const ticket = this.begin("movement");
    this.mode = "JUMPING";
    try {
      await host.ensureTargetLoaded(target, ticket.signal);
      if (!ticket.current()) return false;
      await host.waitForLayout(ticket.signal);
      if (!ticket.current()) return false;
      await host.revealTarget(target, ticket.signal);
      if (!ticket.current()) return false;
      this.mode = "READING";
      return true;
    } catch {
      if (ticket.current()) this.mode = "READING";
      return false;
    }
  }

  capture(): ReadingAnchor | null {
    if (!this.host || !this.identity || this.mode === "JUMPING" || this.mode === "RESTORING") return null;
    const anchor = this.host.captureAnchor();
    return anchor ? { ...anchor, threadId: this.identity.threadId, identity: { ...this.identity } } : null;
  }

  async restore(anchor: ReadingAnchor): Promise<boolean> {
    const host = this.host;
    // Legacy thread-only anchors need explicit migration, never silent branch adoption.
    if (!host || !anchor.identity || !this.identity || anchor.threadId !== this.identity.threadId ||
      identityKey(anchor.identity) !== identityKey(this.identity) || !anchor.turnId || !anchor.itemId) return false;
    const ticket = this.begin("movement");
    this.mode = "RESTORING";
    try {
      await host.ensureTargetLoaded({ turnId: anchor.turnId, itemId: anchor.itemId }, ticket.signal);
      if (!ticket.current()) return false;
      await host.waitForLayout(ticket.signal);
      if (!ticket.current()) return false;
      await host.restoreAnchor(anchor, ticket.signal);
      if (!ticket.current()) return false;
      this.mode = anchor.following ? "FOLLOWING" : "READING";
      return true;
    } catch {
      if (ticket.current()) this.mode = "READING";
      return false;
    }
  }

  private upsert(rows: readonly HistoryMessage[]): void {
    for (const row of rows) if (row.itemId && row.turnId) {
      this.messages.set(row.itemId, { ...row });
      this.revisions.set(row.itemId, ++this.revision);
    }
  }
  private cancel(lane: Lane): void { this.tasks.get(lane)?.abort(); this.tasks.delete(lane); }
  private begin(lane: Lane): Ticket {
    this.cancel(lane);
    const controller = new AbortController();
    this.tasks.set(lane, controller);
    const generation = this.generation;
    return { signal: controller.signal, current: () => generation === this.generation &&
      !controller.signal.aborted && this.tasks.get(lane) === controller };
  }
}
