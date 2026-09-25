import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sha256HexSync } from "../hash-node.js";
import { truncatePromptTitle } from "../hash.js";
import { threadCatalogPath, threadHistoryPath } from "./paths.js";

/** Only `npm run land` should set this. Long-running preview must never. */
export const LIVE_HISTORY_ENV = "CODEX_NAV_READ_HISTORY";

export interface LocalThreadMeta {
  threadId: string;
  title: string | null;
  userPromptCount: number;
  updatedAt: number;
  source: "thread_history";
}

export interface LocalUserPrompt {
  threadId: string;
  turnId: string;
  itemId: string;
  ordinal: number;
  title: string;
  contentHash: string;
}

export interface LocalHistoryPaths {
  historyPath?: string | null;
  catalogPath?: string | null;
}

export interface AgentHeading {
  headingId: string;
  title: string;
}

function resolveHistoryPath(paths: LocalHistoryPaths, home?: string): string | null {
  if (paths.historyPath !== undefined) return paths.historyPath;
  if (process.env[LIVE_HISTORY_ENV] === "1") return threadHistoryPath(home);
  return null;
}

function resolveCatalogPath(paths: LocalHistoryPaths, home?: string): string | null {
  if (paths.catalogPath !== undefined) return paths.catalogPath;
  if (process.env[LIVE_HISTORY_ENV] === "1") return threadCatalogPath(home);
  return null;
}

/** Short-lived read-only handle. Caller must close. Never cache. */
function openReadOnly(path: string): DatabaseSync {
  const uri = `file:${resolve(path)}?mode=ro`;
  const db = new DatabaseSync(uri, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON");
    db.exec("PRAGMA busy_timeout=0");
  } catch {
    /* query_only is best-effort */
  }
  return db;
}

function extractUserText(itemJson: string): string {
  try {
    const parsed = JSON.parse(itemJson) as {
      text?: unknown;
      content?: Array<{ text?: unknown }>;
    };
    if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;
    if (Array.isArray(parsed.content)) {
      return parsed.content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
    }
  } catch {
    /* ignore malformed rows */
  }
  return "";
}

export function firstMarkdownHeading(text: string): AgentHeading | null {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match?.[2]) continue;
    const title = truncatePromptTitle(match[2]) ?? "标题";
    return { headingId: `h-${sha256HexSync(match[2]).slice(0, 12)}`, title };
  }
  return null;
}

function extractAgentText(itemJson: string): string {
  try {
    const parsed = JSON.parse(itemJson) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

export function listLocalThreads(paths: LocalHistoryPaths = {}, home?: string): LocalThreadMeta[] {
  const history = resolveHistoryPath(paths, home);
  if (!history) return [];
  const catalog = resolveCatalogPath(paths, home);
  const db = openReadOnly(history);
  try {
    const rows = db
      .prepare(
        `SELECT t.thread_id AS thread_id,
                COUNT(*) AS user_count,
                MAX(t.rollout_ordinal) AS last_ord
         FROM thread_items t
         WHERE t.item_type = 'userMessage'
         GROUP BY t.thread_id
         ORDER BY last_ord DESC`,
      )
      .all() as Array<{ thread_id: string; user_count: number; last_ord: number }>;

    const titles = new Map<string, string>();
    if (catalog) {
      try {
        const cat = openReadOnly(catalog);
        try {
          const catRows = cat
            .prepare(
              `SELECT thread_id, display_title FROM local_thread_catalog WHERE display_title IS NOT NULL`,
            )
            .all() as Array<{ thread_id: string; display_title: string }>;
          for (const row of catRows) titles.set(row.thread_id, row.display_title);
        } finally {
          cat.close();
        }
      } catch {
        /* catalog is optional; IDs still come from thread_history */
      }
    }

    return rows.map((row) => ({
      threadId: row.thread_id,
      title: titles.get(row.thread_id) ?? null,
      userPromptCount: row.user_count,
      updatedAt: row.last_ord,
      source: "thread_history" as const,
    }));
  } finally {
    db.close();
  }
}

export function listLocalUserPrompts(
  threadId: string,
  paths: LocalHistoryPaths = {},
  home?: string,
): LocalUserPrompt[] {
  const history = resolveHistoryPath(paths, home);
  if (!history) return [];
  const db = openReadOnly(history);
  try {
    const rows = db
      .prepare(
        `SELECT turn_id, item_id, item_json
         FROM thread_items
         WHERE thread_id = ? AND item_type = 'userMessage'
         ORDER BY rollout_ordinal ASC`,
      )
      .all(threadId) as Array<{ turn_id: string; item_id: string; item_json: string }>;

    const prompts: LocalUserPrompt[] = [];
    for (const row of rows) {
      const text = extractUserText(row.item_json);
      const title = truncatePromptTitle(text) ?? `提问 ${prompts.length + 1}`;
      prompts.push({
        threadId,
        turnId: row.turn_id,
        itemId: row.item_id,
        ordinal: prompts.length,
        title,
        contentHash: sha256HexSync(text),
      });
    }
    return prompts;
  } finally {
    db.close();
  }
}

export function firstHeadingForTurn(
  threadId: string,
  turnId: string,
  paths: LocalHistoryPaths = {},
  home?: string,
): AgentHeading | null {
  const history = resolveHistoryPath(paths, home);
  if (!history) return null;
  const db = openReadOnly(history);
  try {
    const rows = db
      .prepare(
        `SELECT item_json FROM thread_items
         WHERE thread_id = ? AND turn_id = ? AND item_type = 'agentMessage'
         ORDER BY rollout_ordinal ASC`,
      )
      .all(threadId, turnId) as Array<{ item_json: string }>;
    for (const row of rows) {
      const heading = firstMarkdownHeading(extractAgentText(row.item_json));
      if (heading) return heading;
    }
  } finally {
    db.close();
  }
  return null;
}
