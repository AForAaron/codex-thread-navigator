export interface SearchableTurn {
  turnId: string;
  itemId?: string;
  role: "user" | "assistant";
  text: string;
}

export interface SearchHit {
  turnId: string;
  itemId?: string;
  role: SearchableTurn["role"];
  snippet: string;
  index: number;
  end: number;
}

export function searchTurns(turns: SearchableTurn[], query: string, limit = 80): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const turn of turns) {
    const hay = turn.text.toLowerCase();
    let from = 0;
    while (from < hay.length && hits.length < limit) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      const start = Math.max(0, at - 24);
      const snippet = `${start > 0 ? "…" : ""}${turn.text.slice(start, at + needle.length + 32).replace(/\s+/g, " ")}${at + needle.length + 32 < turn.text.length ? "…" : ""}`;
      hits.push({ turnId: turn.turnId, itemId: turn.itemId, role: turn.role, snippet, index: at, end: at + needle.length });
      from = at + needle.length;
    }
    if (hits.length >= limit) break;
  }
  return hits;
}
