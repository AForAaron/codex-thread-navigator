#!/usr/bin/env node
/**
 * Manual, short-lived: open ~/.codex thread_history read-only, write navigator.sqlite, exit.
 * Do not leave this process running. Preview server must not import this scan.
 */
process.env.CODEX_NAV_READ_HISTORY = "1";

const { openNavigatorDb } = await import("../dist/packages/core/src/persistence/db.js");
const { navigatorDbPath } = await import("../dist/packages/core/src/persistence/paths.js");
const { firstHeadingForTurn, listLocalThreads, listLocalUserPrompts } = await import(
  "../dist/packages/core/src/discovery/local-history.js"
);
const { threadHistoryPath } = await import("../dist/packages/core/src/discovery/paths.js");
const { indexLocalThread, saveLocalBookmarks, saveLocalReadingPosition } = await import(
  "../dist/packages/core/src/discovery/anchors.js"
);

function clip(id) {
  return `${String(id).slice(0, 13)}…`;
}

const source = threadHistoryPath();
if (!source) {
  console.error("No ~/.codex/thread_history_*.sqlite found.");
  process.exit(1);
}

const threads = listLocalThreads();

// CODEX_NAV_LAND_ALL=1: index every thread's anchors (no bookmarks / reading writes), then exit.
if (process.env.CODEX_NAV_LAND_ALL === "1") {
  if (threads.length === 0) {
    console.error("No local threads found.");
    process.exit(1);
  }
  const dbAll = openNavigatorDb();
  let indexed = 0;
  for (const row of threads) {
    if (row.threadId.startsWith("thread_preview")) continue;
    const prompts = listLocalUserPrompts(row.threadId);
    if (prompts.length === 0) continue;
    indexLocalThread(dbAll, row, prompts);
    indexed += 1;
  }
  dbAll.setPreference("landing.source", "local-thread-history(all)");
  dbAll.close();
  console.log(JSON.stringify({ ok: true, mode: "all", threadsIndexed: indexed, threadsSeen: threads.length }, null, 2));
  process.exit(0);
}

const thread = threads.find((row) => row.userPromptCount >= 3) ?? threads[0];
if (!thread) {
  console.error("No local userMessage rows found.");
  process.exit(1);
}

const prompts = listLocalUserPrompts(thread.threadId);
const selected = prompts[Math.min(2, prompts.length - 1)];
if (!selected) {
  console.error("Selected thread has no user prompts.");
  process.exit(1);
}

if (thread.threadId.startsWith("thread_preview") || selected.turnId.startsWith("turn_u_")) {
  console.error("Refusing fixture ids.");
  process.exit(1);
}

const heading = firstHeadingForTurn(thread.threadId, selected.turnId);
const db = openNavigatorDb();
indexLocalThread(db, thread, prompts);
saveLocalReadingPosition(db, selected, 0);
saveLocalBookmarks(db, selected, heading);
const pos = db.getReadingPosition(thread.threadId);
const marks = db.listBookmarks(thread.threadId);
db.setPreference("landing.source", "local-thread-history");
db.close();

const ok =
  pos?.threadId === thread.threadId &&
  pos?.turnId === selected.turnId &&
  pos?.itemId === selected.itemId &&
  marks.some((row) => row.kind === "turn" && row.turnId === selected.turnId) &&
  marks.some((row) => row.kind === "message" && row.itemId === selected.itemId) &&
  marks.some((row) => row.kind === "heading");

console.log(
  JSON.stringify(
    {
      ok,
      source: "~/.codex/thread_history_*.sqlite",
      sourceFile: source.replace(process.env.HOME ?? "", "~"),
      navigatorDb: navigatorDbPath().replace(process.env.HOME ?? "", "~"),
      threadId: clip(thread.threadId),
      turnId: clip(selected.turnId),
      itemId: clip(selected.itemId),
      promptCount: prompts.length,
      bookmarkKinds: marks.map((row) => row.kind),
      readingMatches: pos?.turnId === selected.turnId,
      fixtureIds: false,
    },
    null,
    2,
  ),
);

if (!ok) process.exit(1);
