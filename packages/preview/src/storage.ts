import type { BookmarkIndex } from "../../core/src/bookmarks/types.ts";
import { mergeFeatures, type FeatureFlags } from "../../core/src/features/flags.ts";
import type { ShortcutBinding, ShortcutId } from "../../core/src/keymap/shortcuts.ts";
import type { ReadingAnchor } from "../../core/src/reading/types.ts";
import { buildNavigatorExport, type NavigatorExport } from "../../core/src/export/export.ts";
import { markOrphanedBookmarks } from "../../core/src/bookmarks/types.ts";

export const PREVIEW_STORAGE_PREFIX = "codex-navigator-preview:v2:";

export interface PreviewPrefs {
  autoRestore: boolean;
  theme: "system" | "light" | "dark";
  panelWidth: number;
  shortcutOverrides: Partial<Record<ShortcutId, string>>;
  removedThreadIds: string[];
  showDebug: boolean;
  features: FeatureFlags;
}

const DEFAULT_PREFS: PreviewPrefs = {
  autoRestore: true,
  theme: "system",
  panelWidth: 260,
  shortcutOverrides: {},
  removedThreadIds: [],
  showDebug: false,
  features: mergeFeatures(),
};

function key(name: string): string {
  return `${PREVIEW_STORAGE_PREFIX}${name}`;
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  localStorage.setItem(key(name), JSON.stringify(value));
}

export function sanitizeAnchor(input: ReadingAnchor): ReadingAnchor {
  return {
    threadId: input.threadId,
    turnId: input.turnId,
    itemId: input.itemId,
    itemIndex: input.itemIndex,
    blockHash: input.blockHash,
    contentHash: input.contentHash,
    offset: input.offset,
  };
}

export class PreviewIndexStorage {
  loadPrefs(): PreviewPrefs {
    const raw = readJson<Partial<PreviewPrefs>>("prefs", {});
    return {
      ...DEFAULT_PREFS,
      ...raw,
      features: mergeFeatures(raw.features),
    };
  }

  savePrefs(prefs: PreviewPrefs): void {
    writeJson("prefs", prefs);
  }

  loadAnchor(threadId: string): ReadingAnchor | null {
    const map = readJson<Record<string, ReadingAnchor>>("anchors", {});
    const saved = map[threadId];
    return saved ? sanitizeAnchor(saved) : null;
  }

  saveAnchor(anchor: ReadingAnchor): void {
    const map = readJson<Record<string, ReadingAnchor>>("anchors", {});
    map[anchor.threadId] = sanitizeAnchor(anchor);
    writeJson("anchors", map);
  }

  listAllBookmarks(): BookmarkIndex[] {
    return readJson<BookmarkIndex[]>("bookmarks", []);
  }

  listBookmarks(threadId: string): BookmarkIndex[] {
    return this.listAllBookmarks().filter((row) => row.threadId === threadId);
  }

  addBookmark(row: BookmarkIndex): BookmarkIndex {
    const all = this.listAllBookmarks().filter((item) => item.id !== row.id);
    all.push(row);
    writeJson("bookmarks", all);
    return row;
  }

  renameBookmark(id: string, title: string): void {
    writeJson(
      "bookmarks",
      this.listAllBookmarks().map((row) => (row.id === id ? { ...row, title } : row)),
    );
  }

  removeBookmark(id: string): void {
    writeJson(
      "bookmarks",
      this.listAllBookmarks().filter((row) => row.id !== id),
    );
  }

  applyOrphans(liveThreadIds: readonly string[]): BookmarkIndex[] {
    const marked = markOrphanedBookmarks(this.listAllBookmarks(), liveThreadIds);
    writeJson("bookmarks", marked);
    return marked;
  }

  exportIndex(threads: Array<{ threadId: string; title: string | null }>): NavigatorExport {
    const anchors = Object.values(readJson<Record<string, ReadingAnchor>>("anchors", {}));
    return buildNavigatorExport({
      threads,
      anchors,
      bookmarks: this.listAllBookmarks().map(({ blockHash: _b, createdAt: _c, ...rest }) => rest),
      preferences: this.loadPrefs() as unknown as Record<string, unknown>,
    });
  }
}

export function createPreviewStorage(): PreviewIndexStorage {
  return new PreviewIndexStorage();
}

export function applyShortcutOverrides(
  defaults: ShortcutBinding[],
  overrides: Partial<Record<ShortcutId, string>>,
  parse: (chord: string) => ShortcutBinding["spec"],
): ShortcutBinding[] {
  return defaults.map((row) => {
    const chord = overrides[row.id];
    if (!chord) return row;
    return { ...row, chord, spec: parse(chord) };
  });
}
