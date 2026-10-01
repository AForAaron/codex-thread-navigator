import { readKnownThreadHistory } from "./thread-directory.mjs";

const MAX_RETURNED_HITS = 200;

export function searchThreadHistory(history, query, limit = MAX_RETURNED_HITS) {
  if (typeof query !== "string" || !query.trim() || query.length > 200) throw new Error("Invalid search query");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RETURNED_HITS) throw new Error("Invalid search limit");
  const needle = query.trim();
  const expression = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const ordinalByTurn = new Map(history.stableTurnIds.map((id, index) => [id, index + 1]));
  const hits = [];
  let totalMatches = 0;
  for (const message of history.messages) {
    const text = message.text;
    for (const match of text.matchAll(expression)) {
      const at = match.index;
      ++totalMatches;
      if (hits.length < limit) {
        const start = Math.max(0, at - 30);
        const end = Math.min(text.length, at + match[0].length + 46);
        hits.push({
          ordinal: ordinalByTurn.get(message.turnId) ?? null,
          turnId: message.turnId,
          itemId: message.itemId,
          role: message.role === "userMessage" ? "user" : "assistant",
          index: at,
          end: at + match[0].length,
          snippet: `${start ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`,
        });
      }
    }
  }
  return {
    kind: "known-thread-search",
    threadId: history.threadId,
    query,
    historyComplete: true,
    turnCount: history.turnCount,
    totalMatches,
    returnedHits: hits.length,
    resultsTruncated: totalMatches > hits.length,
    hits,
  };
}

export async function searchKnownThread(threadId, query) {
  return searchThreadHistory(await readKnownThreadHistory(threadId), query);
}
