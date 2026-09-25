-- Codex Navigator index schema.
-- Store identifiers, hashes, offsets, and short titles only.
-- NEVER store conversation body / message text / transcripts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT PRIMARY KEY,
  title TEXT,
  last_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_positions (
  thread_id TEXT PRIMARY KEY,
  turn_id TEXT,
  item_id TEXT,
  content_hash TEXT,
  offset REAL,
  viewport_locked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  item_id TEXT,
  content_hash TEXT,
  title TEXT,
  kind TEXT NOT NULL DEFAULT 'turn',
  heading_id TEXT,
  orphaned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE TABLE IF NOT EXISTS prompt_index (
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT,
  ordinal INTEGER NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  offset REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, turn_id, item_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_thread ON bookmarks(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_index_thread_ordinal ON prompt_index(thread_id, ordinal);
