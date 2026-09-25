import type { ReadingAnchor, RestoreCandidate, RestoreResult } from "./types.js";

/**
 * Resolve a saved reading anchor against the current scan.
 * Fallback order (no Viewport Lock, no mutation intercept):
 *   1. turnId + itemId + blockHash
 *   2. turnId + itemId
 *   3. turnId (prefer matching itemIndex when present)
 */
export function restoreReadingPosition(saved: ReadingAnchor, candidates: RestoreCandidate[]): RestoreResult {
  if (!saved.turnId || candidates.length === 0) {
    return { ok: false, tier: "none" };
  }

  if (saved.itemId && saved.blockHash) {
    const hit = candidates.find(
      (row) => row.turnId === saved.turnId && row.itemId === saved.itemId && row.blockHash === saved.blockHash,
    );
    if (hit) return { ok: true, candidate: hit, tier: "turn+item+block" };
  }

  if (saved.itemId) {
    const hit = candidates.find((row) => row.turnId === saved.turnId && row.itemId === saved.itemId);
    if (hit) return { ok: true, candidate: hit, tier: "turn+item" };
  }

  const sameTurn = candidates.filter((row) => row.turnId === saved.turnId);
  if (sameTurn.length === 0) return { ok: false, tier: "none" };
  if (saved.itemIndex != null) {
    const byIndex = sameTurn.find((row) => row.itemIndex === saved.itemIndex);
    if (byIndex) return { ok: true, candidate: byIndex, tier: "turn" };
  }
  return { ok: true, candidate: sameTurn[0]!, tier: "turn" };
}
