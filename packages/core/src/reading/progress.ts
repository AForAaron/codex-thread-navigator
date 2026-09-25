/** Map a 0–1 position on the Codex conversation scrubber to a turn. */

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function turnIndexFromRatio(ratio: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(clamp01(ratio) * count)));
}

export function ratioFromTurnIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  return clamp01(index / Math.max(1, count - 1));
}

export function previewSnippet(text: string, maxChars = 90): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function previewTitle(text: string): string {
  return previewSnippet(text, 22);
}
