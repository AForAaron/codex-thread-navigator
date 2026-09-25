export type ShortcutId =
  | "toggleNavigator"
  | "prevPrompt"
  | "nextPrompt"
  | "bookmark"
  | "jumpLatest"
  | "search"
  | "escape";

export interface KeySpec {
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export interface ShortcutBinding {
  id: ShortcutId;
  spec: KeySpec;
  label: string;
  chord: string;
}

export const PREVIEW_DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { id: "toggleNavigator", spec: { meta: true, shift: true, alt: false, key: "n" }, label: "开关 Navigator", chord: "⌘⇧N" },
  { id: "prevPrompt", spec: { meta: true, shift: true, alt: false, key: "arrowup" }, label: "上一条 User Prompt", chord: "⌘⇧↑" },
  { id: "nextPrompt", spec: { meta: true, shift: true, alt: false, key: "arrowdown" }, label: "下一条 User Prompt", chord: "⌘⇧↓" },
  { id: "bookmark", spec: { meta: true, shift: false, alt: true, key: "b" }, label: "Bookmark 当前位置", chord: "⌥⌘B" },
  { id: "jumpLatest", spec: { meta: true, shift: true, alt: false, key: "l" }, label: "Jump Latest", chord: "⌘⇧L" },
  { id: "search", spec: { meta: true, shift: true, alt: false, key: "f" }, label: "Search this conversation", chord: "⌘⇧F" },
  { id: "escape", spec: { meta: false, shift: false, alt: false, key: "escape" }, label: "关闭搜索 / 面板", chord: "Esc" },
];

export function normalizeKey(key: string): string {
  const lower = key.trim().toLowerCase();
  if (lower === "up" || lower === "↑") return "arrowup";
  if (lower === "down" || lower === "↓") return "arrowdown";
  if (lower === "esc") return "escape";
  if (lower === "cmd" || lower === "command" || lower === "ctrl" || lower === "control" || lower === "meta") {
    return "meta";
  }
  return lower;
}

/** Parse chords like "Meta+Shift+N", "⌘⇧↑", "Alt+Meta+B", "Escape". */
export function parseShortcut(chord: string): KeySpec {
  const compact = chord.trim();
  if (/^esc(ape)?$/i.test(compact)) return { meta: false, shift: false, alt: false, key: "escape" };

  let meta = false;
  let shift = false;
  let alt = false;
  const tokens: string[] = [];

  if (/[⌘⇧⌥↑↓]/.test(compact) && !compact.includes("+")) {
    meta = compact.includes("⌘");
    shift = compact.includes("⇧");
    alt = compact.includes("⌥");
    const rest = compact.replace(/[⌘⇧⌥]/g, "");
    tokens.push(rest || "");
  } else {
    for (const part of compact.split("+").map((p) => p.trim()).filter(Boolean)) {
      const n = normalizeKey(part);
      if (n === "meta" || n === "⌘") meta = true;
      else if (n === "shift" || n === "⇧") shift = true;
      else if (n === "alt" || n === "option" || n === "⌥") alt = true;
      else tokens.push(n);
    }
  }

  const rawKey = tokens.join("") || compact.replace(/[⌘⇧⌥+]/g, "");
  return { meta, shift, alt, key: normalizeKey(rawKey) };
}

export interface KeyLike {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  key: string;
}

export function eventToKeySpec(event: KeyLike): KeySpec {
  return {
    meta: Boolean(event.metaKey || event.ctrlKey),
    shift: Boolean(event.shiftKey),
    alt: Boolean(event.altKey),
    key: normalizeKey(event.key),
  };
}

export function matchShortcut(event: KeyLike, spec: KeySpec): boolean {
  const got = eventToKeySpec(event);
  return got.meta === spec.meta && got.shift === spec.shift && got.alt === spec.alt && got.key === spec.key;
}

export function matchPreviewShortcut(event: KeyLike, bindings = PREVIEW_DEFAULT_SHORTCUTS): ShortcutBinding | null {
  return bindings.find((binding) => matchShortcut(event, binding.spec)) ?? null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
