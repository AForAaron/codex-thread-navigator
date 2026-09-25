/** Maximum stored title length. Titles are index labels, not conversation body. */
export const MAX_TITLE_CHARS = 120;

/** Navigator Prompt 列表标题：30–50 字（默认 40）。 */
export const PROMPT_TITLE_MIN = 30;
export const PROMPT_TITLE_MAX = 50;
export const PROMPT_TITLE_CHARS = 40;

export function truncateTitle(raw: string | null | undefined, max = MAX_TITLE_CHARS): string | null {
  if (raw == null) return null;
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function truncatePromptTitle(raw: string | null | undefined, max = PROMPT_TITLE_CHARS): string | null {
  const clamped = Math.min(PROMPT_TITLE_MAX, Math.max(PROMPT_TITLE_MIN, max));
  return truncateTitle(raw, clamped);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
