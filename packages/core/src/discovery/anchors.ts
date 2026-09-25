import type { NavigatorDb } from "../persistence/db.js";
import type { AgentHeading, LocalThreadMeta, LocalUserPrompt } from "./local-history.js";

export function indexLocalThread(db: NavigatorDb, thread: LocalThreadMeta, prompts: LocalUserPrompt[]): void {
  db.upsertThread(thread.threadId, thread.title);
  db.replacePromptIndex(
    thread.threadId,
    prompts.map((row) => ({
      threadId: row.threadId,
      turnId: row.turnId,
      itemId: row.itemId,
      ordinal: row.ordinal,
      title: row.title,
      contentHash: row.contentHash,
      offset: null,
    })),
  );
}

export function saveLocalReadingPosition(
  db: NavigatorDb,
  prompt: LocalUserPrompt,
  offset = 0,
): void {
  db.saveReadingPosition({
    threadId: prompt.threadId,
    turnId: prompt.turnId,
    itemId: prompt.itemId,
    contentHash: prompt.contentHash,
    offset,
    viewportLocked: false,
  });
}

export function saveLocalBookmarks(
  db: NavigatorDb,
  prompt: LocalUserPrompt,
  heading: AgentHeading | null,
): { turn: number; message: number; heading: number } {
  const turn = db.addBookmark({
    threadId: prompt.threadId,
    turnId: prompt.turnId,
    itemId: prompt.itemId,
    contentHash: prompt.contentHash,
    title: prompt.title,
    kind: "turn",
  });
  const message = db.addBookmark({
    threadId: prompt.threadId,
    turnId: prompt.turnId,
    itemId: prompt.itemId,
    contentHash: prompt.contentHash,
    title: prompt.title,
    kind: "message",
  });
  const headingTitle = heading?.title ?? "本轮无显式标题";
  const headingId = heading?.headingId ?? `h-none-${prompt.turnId}`;
  const headingRow = db.addBookmark({
    threadId: prompt.threadId,
    turnId: prompt.turnId,
    itemId: prompt.itemId,
    contentHash: prompt.contentHash,
    title: headingTitle,
    kind: "heading",
    headingId,
  });
  return { turn, message, heading: headingRow };
}
