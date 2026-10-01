import { existsSync } from "node:fs";
import { ReadOnlyAppServer } from "../../scripts/appserver-history-client.mjs";

const MAX_TITLE_CHARS = 88;

function shortTitle(text, fallback) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  if (!oneLine) return fallback;
  const chars = Array.from(oneLine);
  return chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS - 1).join("")}…` : oneLine;
}

export function buildThreadDirectory(history) {
  const firstUserByTurn = new Map();
  for (const message of history.messages) {
    if (message.role === "userMessage" && !firstUserByTurn.has(message.turnId)) {
      firstUserByTurn.set(message.turnId, message);
    }
  }
  return {
    kind: "known-thread-directory",
    threadId: history.threadId,
    method: history.method,
    complete: true,
    turnCount: history.turnCount,
    entries: history.stableTurnIds.map((turnId, index) => {
      const user = firstUserByTurn.get(turnId);
      return {
        ordinal: index + 1,
        turnId,
        userMessageId: user?.itemId ?? null,
        title: shortTitle(user?.text ?? "", `轮次 ${index + 1}`),
      };
    }),
  };
}

export async function readKnownThreadHistory(threadId) {
  const command = process.env.CODEX_NAV_CODEX_BIN ||
    (existsSync("/opt/homebrew/bin/codex") ? "/opt/homebrew/bin/codex" : "codex");
  const client = new ReadOnlyAppServer({ command });
  try {
    await client.connect();
    return await client.read(threadId);
  } finally {
    await client.close();
  }
}

export async function readKnownThreadDirectory(threadId) {
  return buildThreadDirectory(await readKnownThreadHistory(threadId));
}
