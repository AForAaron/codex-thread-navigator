import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { truncateTitle } from "../hash.js";
import { navigatorDbPath } from "./paths.js";
import { readSchemaSql } from "./schema.js";

export interface ThreadRecord {
  threadId: string;
  title: string | null;
  lastSeenAt: number;
  updatedAt: number;
}

export interface ReadingPositionRecord {
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  contentHash: string | null;
  offset: number | null;
  viewportLocked: boolean;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: number;
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  contentHash: string | null;
  title: string | null;
  kind: string;
  headingId: string | null;
  orphaned: boolean;
  createdAt: number;
}

export interface PromptIndexRecord {
  threadId: string;
  turnId: string;
  itemId: string | null;
  ordinal: number;
  title: string | null;
  contentHash: string;
  offset: number | null;
  updatedAt: number;
}

export class NavigatorDb {
  constructor(private readonly db: DatabaseSync) {}

  migrate(): void {
    this.db.exec(readSchemaSql());
    this.addColumnIfMissing("bookmarks", "kind", "TEXT NOT NULL DEFAULT 'turn'");
    this.addColumnIfMissing("bookmarks", "heading_id", "TEXT");
    this.addColumnIfMissing("bookmarks", "orphaned", "INTEGER NOT NULL DEFAULT 0");
    this.ensurePromptIndexItemKey();
  }

  private ensurePromptIndexItemKey(): void {
    const cols = this.db.prepare(`PRAGMA table_info(prompt_index)`).all() as Array<{ name: string; pk: number }>;
    if (cols.length === 0) return;
    const pk = cols.filter((col) => col.pk > 0).map((col) => col.name);
    if (pk.includes("item_id")) return;
    if (!cols.some((col) => col.name === "item_id")) {
      // Pre-item_id v1 tables never had the column; COALESCE(item_id, turn_id) below would crash on it.
      this.db.exec(`ALTER TABLE prompt_index ADD COLUMN item_id TEXT`);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_index_v2 (
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        title TEXT,
        content_hash TEXT NOT NULL,
        offset REAL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (thread_id, turn_id, item_id),
        FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
      );
      INSERT OR IGNORE INTO prompt_index_v2
        (thread_id, turn_id, item_id, ordinal, title, content_hash, offset, updated_at)
      SELECT thread_id, turn_id, COALESCE(item_id, turn_id), ordinal, title, content_hash, offset, updated_at
      FROM prompt_index;
      DROP TABLE prompt_index;
      ALTER TABLE prompt_index_v2 RENAME TO prompt_index;
      CREATE INDEX IF NOT EXISTS idx_prompt_index_thread_ordinal ON prompt_index(thread_id, ordinal);
    `);
  }

  private addColumnIfMissing(table: string, column: string, decl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (cols.some((col) => col.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }

  upsertThread(threadId: string, title?: string | null, now = Date.now()): void {
    const safeTitle = truncateTitle(title ?? null);
    this.db
      .prepare(
        `INSERT INTO threads(thread_id, title, last_seen_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           title = COALESCE(excluded.title, threads.title),
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
      )
      .run(threadId, safeTitle, now, now);
  }

  saveReadingPosition(record: Omit<ReadingPositionRecord, "updatedAt">, now = Date.now()): void {
    this.upsertThread(record.threadId, null, now);
    this.db
      .prepare(
        `INSERT INTO reading_positions(thread_id, turn_id, item_id, content_hash, offset, viewport_locked, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           turn_id = excluded.turn_id,
           item_id = excluded.item_id,
           content_hash = excluded.content_hash,
           offset = excluded.offset,
           viewport_locked = excluded.viewport_locked,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.threadId,
        record.turnId,
        record.itemId,
        record.contentHash,
        record.offset,
        record.viewportLocked ? 1 : 0,
        now,
      );
  }

  getReadingPosition(threadId: string): ReadingPositionRecord | null {
    const row = this.db
      .prepare(
        `SELECT thread_id, turn_id, item_id, content_hash, offset, viewport_locked, updated_at
         FROM reading_positions WHERE thread_id = ?`,
      )
      .get(threadId) as
      | {
          thread_id: string;
          turn_id: string | null;
          item_id: string | null;
          content_hash: string | null;
          offset: number | null;
          viewport_locked: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      threadId: row.thread_id,
      turnId: row.turn_id,
      itemId: row.item_id,
      contentHash: row.content_hash,
      offset: row.offset,
      viewportLocked: row.viewport_locked === 1,
      updatedAt: row.updated_at,
    };
  }

  addBookmark(input: {
    threadId: string;
    turnId?: string | null;
    itemId?: string | null;
    contentHash?: string | null;
    title?: string | null;
    kind?: string;
    headingId?: string | null;
    orphaned?: boolean;
  }, now = Date.now()): number {
    this.upsertThread(input.threadId, null, now);
    const result = this.db
      .prepare(
        `INSERT INTO bookmarks(thread_id, turn_id, item_id, content_hash, title, kind, heading_id, orphaned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.threadId,
        input.turnId ?? null,
        input.itemId ?? null,
        input.contentHash ?? null,
        truncateTitle(input.title ?? null),
        input.kind ?? "turn",
        input.headingId ?? null,
        input.orphaned ? 1 : 0,
        now,
      );
    return Number(result.lastInsertRowid);
  }

  listBookmarks(threadId: string): BookmarkRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, thread_id, turn_id, item_id, content_hash, title, kind, heading_id, orphaned, created_at
         FROM bookmarks WHERE thread_id = ? ORDER BY created_at ASC`,
      )
      .all(threadId) as Array<{
      id: number;
      thread_id: string;
      turn_id: string | null;
      item_id: string | null;
      content_hash: string | null;
      title: string | null;
      kind: string;
      heading_id: string | null;
      orphaned: number;
      created_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      turnId: row.turn_id,
      itemId: row.item_id,
      contentHash: row.content_hash,
      title: row.title,
      kind: row.kind,
      headingId: row.heading_id,
      orphaned: row.orphaned === 1,
      createdAt: row.created_at,
    }));
  }

  replacePromptIndex(threadId: string, items: Omit<PromptIndexRecord, "updatedAt">[], now = Date.now()): void {
    this.upsertThread(threadId, null, now);
    const del = this.db.prepare(`DELETE FROM prompt_index WHERE thread_id = ?`);
    const ins = this.db.prepare(
      `INSERT INTO prompt_index(thread_id, turn_id, item_id, ordinal, title, content_hash, offset, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.exec("BEGIN");
    try {
      del.run(threadId);
      for (const item of items) {
        ins.run(
          item.threadId,
          item.turnId,
          item.itemId ?? item.turnId,
          item.ordinal,
          truncateTitle(item.title),
          item.contentHash,
          item.offset,
          now,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getPreference(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM preferences WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setPreference(key: string, value: string, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO preferences(key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now);
  }

  listThreads(): ThreadRecord[] {
    const rows = this.db
      .prepare(
        `SELECT thread_id, title, last_seen_at, updated_at FROM threads ORDER BY last_seen_at DESC`,
      )
      .all() as Array<{
      thread_id: string;
      title: string | null;
      last_seen_at: number;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      threadId: row.thread_id,
      title: row.title,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    }));
  }

  listPromptIndex(threadId: string): PromptIndexRecord[] {
    const rows = this.db
      .prepare(
        `SELECT thread_id, turn_id, item_id, ordinal, title, content_hash, offset, updated_at
         FROM prompt_index WHERE thread_id = ? ORDER BY ordinal ASC`,
      )
      .all(threadId) as Array<{
      thread_id: string;
      turn_id: string;
      item_id: string | null;
      ordinal: number;
      title: string | null;
      content_hash: string;
      offset: number | null;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      threadId: row.thread_id,
      turnId: row.turn_id,
      itemId: row.item_id,
      ordinal: row.ordinal,
      title: row.title,
      contentHash: row.content_hash,
      offset: row.offset,
      updatedAt: row.updated_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

export function openNavigatorDb(dbPath = navigatorDbPath()): NavigatorDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // Concurrent tabs hit /api/select at the same time; wait out brief write locks instead of 500-ing.
  db.exec("PRAGMA busy_timeout=500");
  const nav = new NavigatorDb(db);
  nav.migrate();
  return nav;
}
