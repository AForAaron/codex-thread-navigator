import type { BookmarkIndex, BookmarkKind } from "../../../core/src/bookmarks/types.ts";
import { FEATURE_KEYS, FEATURE_META, mergeFeatures, type FeatureFlags, type FeatureKey } from "../../../core/src/features/flags.ts";
import type { ShortcutBinding } from "../../../core/src/keymap/shortcuts.ts";
import type { OutlineHeading } from "../../../core/src/outline/headings.ts";
import type { SearchHit } from "../../../core/src/search/search.ts";

export type NavigatorTab = "prompts" | "outline" | "bookmarks" | "search" | "settings";

export interface PromptRow {
  title: string;
  turnId: string;
  itemId?: string;
  itemIndex?: number;
  bookmarked?: boolean;
}

export interface ThreadOption {
  threadId: string;
  title: string;
  live: boolean;
}

export interface NavigatorPanelOptions {
  enabled: boolean;
  shortcuts?: Array<Pick<ShortcutBinding, "id" | "chord" | "label">>;
  threads?: ThreadOption[];
  currentThreadId?: string;
  autoRestore?: boolean;
  theme?: "system" | "light" | "dark";
  follow?: boolean;
  unreadNew?: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onJumpLatest: () => void;
  onRefresh: () => void;
  onCollapse?: () => void;
  onPromptClick?: (row: PromptRow) => void;
  onBookmarkClick?: (row: BookmarkIndex) => void;
  onPrevPrompt?: () => void;
  onNextPrompt?: () => void;
  onBookmark?: (kind?: BookmarkKind) => void;
  onRenameBookmark?: (id: string, title: string) => void;
  onDeleteBookmark?: (id: string) => void;
  onOutlineClick?: (row: OutlineHeading) => void;
  onSearch?: (query: string) => void;
  onSearchHit?: (hit: SearchHit) => void;
  onThreadChange?: (threadId: string) => void;
  onAutoRestoreChange?: (enabled: boolean) => void;
  onThemeChange?: (theme: "system" | "light" | "dark") => void;
  onShortcutChange?: (id: string, chord: string) => void;
  onExport?: () => void;
  onRemoveOrphanThread?: () => void;
  onSimulateGenerate?: () => void;
  onJumpNewContent?: () => void;
  showDebug?: boolean;
  onShowDebugChange?: (enabled: boolean) => void;
  features?: FeatureFlags;
  onFeatureChange?: (key: FeatureKey, enabled: boolean) => void;
}

export interface NavigatorPanelApi {
  root: HTMLElement;
  searchInput: HTMLInputElement;
  setStatus(text: string): void;
  setThreadId(id: string | null): void;
  setPrompts(rows: PromptRow[], message?: string): void;
  setActiveTurn(turnId: string | null): void;
  setBookmarks(rows: BookmarkIndex[]): void;
  setOutline(rows: OutlineHeading[]): void;
  setSearchHits(rows: SearchHit[]): void;
  setEnabled(enabled: boolean): void;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setTab(tab: NavigatorTab): void;
  setFollow(following: boolean, unreadNew: boolean): void;
  focusSearch(): void;
  closeSearch(): void;
  setThreads(threads: ThreadOption[], currentId?: string): void;
  setShortcuts(rows: Array<Pick<ShortcutBinding, "id" | "chord" | "label">>): void;
  setSettingsOpen(open: boolean): void;
  setFeatures(features: FeatureFlags): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<string | Node> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function createNavigatorPanel(options: NavigatorPanelOptions): NavigatorPanelApi {
  const status = el("p", { class: "cn-status cn-debug", "data-cn": "status" }, ["预览模式"]);
  const thread = el("p", { class: "cn-thread cn-debug" }, ["threadId: —"]);
  const list = el("ul", { class: "cn-list", "data-cn-list": "prompts", tabindex: "0" });
  const outlineList = el("ul", { class: "cn-list", "data-cn-list": "outline", tabindex: "0" });
  const bookmarkList = el("ul", { class: "cn-list", "data-cn-list": "bookmarks", tabindex: "0" });
  const searchList = el("ul", { class: "cn-list", "data-cn-list": "search", tabindex: "0" });
  const empty = el("p", { class: "cn-empty" }, ["暂无 User Prompt。"]);
  const searchInput = el("input", {
    type: "search",
    class: "cn-search",
    placeholder: "搜索本对话",
    "data-cn": "search",
  }) as HTMLInputElement;
  const searchField = el("label", { class: "cn-search-field" }, [
    el("span", { class: "cn-search-icon", "aria-hidden": "true" }, ["⌕"]),
    searchInput,
  ]);
  const enable = el("input", { type: "checkbox", id: "cn-enabled" }) as HTMLInputElement;
  enable.checked = options.enabled;
  enable.dataset.cn = "toggle";
  const keymap = el("ul", { class: "cn-keymap", "data-cn": "keymap" });
  for (const row of options.shortcuts ?? []) {
    keymap.append(el("li", {}, [el("kbd", { class: "cn-kbd" }, [row.chord]), el("span", { class: "cn-cap" }, [row.label])]));
  }

  const threadSelect = el("select", { class: "cn-select cn-sr-only", "data-cn": "thread" }) as HTMLSelectElement;
  for (const item of options.threads ?? []) {
    const opt = document.createElement("option");
    opt.value = item.threadId;
    opt.textContent = item.live ? item.title : `${item.title} (removed)`;
    if (item.threadId === options.currentThreadId) opt.selected = true;
    threadSelect.append(opt);
  }

  const autoRestore = el("input", { type: "checkbox", "data-cn": "auto-restore" }) as HTMLInputElement;
  autoRestore.checked = options.autoRestore !== false;
  const themeSelect = el("select", { class: "cn-select", "data-cn": "theme" }) as HTMLSelectElement;
  for (const value of ["system", "light", "dark"] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === (options.theme ?? "system")) opt.selected = true;
    themeSelect.append(opt);
  }

  const showDebug = el("input", { type: "checkbox", "data-cn": "show-debug" }) as HTMLInputElement;
  showDebug.checked = options.showDebug === true;
  let features = mergeFeatures(options.features);
  const featureInputs = {} as Record<FeatureKey, HTMLInputElement>;
  const featureBox = el("div", { class: "cn-feature-list" }, [el("h3", { class: "cn-settings-title" }, ["功能开关"])]);
  for (const key of FEATURE_KEYS) {
    const box = el("input", { type: "checkbox", "data-cn-feature": key }) as HTMLInputElement;
    box.checked = features[key];
    featureInputs[key] = box;
    const meta = FEATURE_META[key];
    featureBox.append(
      el("label", { class: "cn-feature-row", "data-feature-row": key }, [
        box,
        el("span", { class: "cn-feature-copy" }, [
          el("strong", {}, [meta.label]),
          el("span", { class: "cn-cap" }, [meta.hint]),
        ]),
      ]),
    );
  }
  const settings = el("div", { class: "cn-settings", "data-cn-list": "settings", hidden: "true" }, [
    el("h2", { class: "cn-settings-title" }, ["设置"]),
    featureBox,
    el("label", { class: "cn-setting-row" }, [enable, " 显示面板"]),
    el("label", { class: "cn-setting-row" }, [autoRestore, " 自动恢复阅读位置"]),
    el("label", { class: "cn-setting-row" }, [showDebug, " 显示调试信息"]),
    el("label", { class: "cn-setting-row" }, ["主题 ", themeSelect]),
    el("p", { class: "cn-cap" }, ["改 Jump Latest 快捷键（立即生效）"]),
  ]);
  const shortcutEdit = el("input", { type: "text", class: "cn-field", value: "⌘⇧L", "data-cn": "shortcut-latest" }) as HTMLInputElement;
  const shortcutSearch = el("input", { type: "text", class: "cn-field", value: "⌘⇧F", "data-cn": "shortcut-search" }) as HTMLInputElement;
  settings.append(shortcutEdit, el("p", { class: "cn-cap" }, ["改 Search 快捷键（立即生效）"]), shortcutSearch);
  const exportBtn = el("button", { type: "button", class: "cn-btn", "data-cn": "export" }, ["Export Navigator Data"]);
  const orphanBtn = el("button", { type: "button", class: "cn-btn", "data-cn": "remove-orphan" }, ["从目录移除 Orphan thread"]);
  settings.append(exportBtn, orphanBtn, el("p", { class: "cn-keymap-title" }, ["页内快捷键（非系统全局）"]), keymap);

  const tabs: Exclude<NavigatorTab, "settings">[] = ["prompts", "outline", "bookmarks", "search"];
  const tabLabel: Record<Exclude<NavigatorTab, "settings">, string> = {
    prompts: "提问",
    outline: "大纲",
    bookmarks: "书签",
    search: "搜索",
  };
  const tabBar = el("div", { class: "cn-tabs", role: "tablist" });
  let activeTab: NavigatorTab = "prompts";
  let settingsOpen = false;
  let visible = true;
  let promptRows: PromptRow[] = [];
  let outlineRows: OutlineHeading[] = [];
  let bookmarkRows: BookmarkIndex[] = [];
  let searchRows: SearchHit[] = [];
  let searchOpen = false;

  const jumpLatest = el("button", { type: "button", class: "cn-btn", "data-cn": "latest" }, ["跳到最新"]);
  const prevBtn = el("button", { type: "button", class: "cn-btn", "data-cn": "prev" }, ["上一问"]);
  const nextBtn = el("button", { type: "button", class: "cn-btn", "data-cn": "next" }, ["下一问"]);
  const bookmarkTurn = el("button", { type: "button", class: "cn-btn", "data-cn": "bookmark-turn" }, ["★ 轮次"]);
  const bookmarkMsg = el("button", { type: "button", class: "cn-btn", "data-cn": "bookmark-message" }, ["★ 消息"]);
  const bookmarkHd = el("button", { type: "button", class: "cn-btn", "data-cn": "bookmark-heading" }, ["★ 标题"]);
  const bookmarkBtn = el("button", { type: "button", class: "cn-btn", "data-cn": "bookmark" }, ["收藏"]);
  const refresh = el("button", { type: "button", class: "cn-btn" }, ["刷新列表"]);
  const collapse = el("button", { type: "button", class: "cn-btn cn-collapse", "data-cn": "collapse" }, ["折叠"]);
  const gear = el("button", { type: "button", class: "cn-btn cn-gear", "data-cn": "settings-gear", "aria-label": "设置" }, ["⚙"]);
  const simulate = el("button", { type: "button", class: "cn-btn", "data-cn": "simulate" }, ["模拟生成"]);
  const newContent = el("button", { type: "button", class: "cn-btn cn-new", "data-cn": "new-content", hidden: "true" }, [
    "↓ 新内容",
  ]);
  const followBadge = el("span", { class: "cn-follow cn-debug", "data-cn": "follow" }, ["Follow OFF"]);

  const root = el("aside", { class: "codex-navigator", "data-codex-navigator": "true", "aria-label": "Codex Navigator" }, [
    el("header", { class: "cn-header" }, [
      el("div", { class: "cn-brand" }, [el("strong", {}, ["提问"]), el("span", { class: "cn-cap" }, ["当前会话细目录"])]),
      el("div", { class: "cn-header-actions" }, [gear, collapse]),
    ]),
    threadSelect,
    searchField,
    tabBar,
    el("div", { class: "cn-meta" }, [thread, status, followBadge]),
    empty,
    list,
    outlineList,
    bookmarkList,
    searchList,
    settings,
    el("footer", { class: "cn-footer" }, [
      prevBtn,
      nextBtn,
      bookmarkBtn,
      bookmarkTurn,
      bookmarkMsg,
      bookmarkHd,
      refresh,
      jumpLatest,
      simulate,
      newContent,
    ]),
  ]);

  const lists = { prompts: list, outline: outlineList, bookmarks: bookmarkList, search: searchList };

  const applyTab = (tab: Exclude<NavigatorTab, "settings">) => {
    settingsOpen = false;
    settings.hidden = true;
    gear.setAttribute("aria-pressed", "false");
    activeTab = tab;
    searchOpen = tab === "search";
    for (const btn of tabBar.querySelectorAll("button")) {
      btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
    }
    for (const [name, node] of Object.entries(lists)) {
      node.hidden = name !== tab;
    }
    empty.hidden = true;
    if (tab === "prompts") {
      empty.hidden = promptRows.length > 0;
      empty.textContent = "暂无提问。";
    } else if (tab === "outline") {
      empty.hidden = outlineList.childElementCount > 0;
      empty.textContent = "这篇回答没有标题。";
    } else if (tab === "bookmarks") {
      empty.hidden = bookmarkList.childElementCount > 0;
      empty.textContent = "还没有书签。";
    } else if (tab === "search") {
      empty.hidden = searchList.childElementCount > 0;
      empty.textContent = "输入关键词搜索当前对话。";
    }
  };

  const applySettings = (open: boolean) => {
    settingsOpen = open;
    settings.hidden = !open;
    gear.setAttribute("aria-pressed", open ? "true" : "false");
    if (open) {
      for (const node of Object.values(lists)) node.hidden = true;
      empty.hidden = true;
      for (const btn of tabBar.querySelectorAll("button")) btn.setAttribute("aria-selected", "false");
    } else {
      applyTab(activeTab === "settings" ? "prompts" : (activeTab as Exclude<NavigatorTab, "settings">));
    }
  };

  for (const tab of tabs) {
    const btn = el("button", { type: "button", role: "tab", "data-tab": tab }, [tabLabel[tab]]);
    btn.addEventListener("click", () => applyTab(tab));
    tabBar.append(btn);
  }

  enable.addEventListener("change", () => options.onToggleEnabled(enable.checked));
  jumpLatest.addEventListener("click", () => options.onJumpLatest());
  prevBtn.addEventListener("click", () => options.onPrevPrompt?.());
  nextBtn.addEventListener("click", () => options.onNextPrompt?.());
  bookmarkBtn.addEventListener("click", () => options.onBookmark?.());
  bookmarkTurn.addEventListener("click", () => options.onBookmark?.("turn"));
  bookmarkMsg.addEventListener("click", () => options.onBookmark?.("message"));
  bookmarkHd.addEventListener("click", () => options.onBookmark?.("heading"));
  refresh.addEventListener("click", () => options.onRefresh());
  collapse.addEventListener("click", () => options.onCollapse?.());
  simulate.addEventListener("click", () => options.onSimulateGenerate?.());
  newContent.addEventListener("click", () => options.onJumpNewContent?.());
  threadSelect.addEventListener("change", () => options.onThreadChange?.(threadSelect.value));
  autoRestore.addEventListener("change", () => options.onAutoRestoreChange?.(autoRestore.checked));
  themeSelect.addEventListener("change", () => options.onThemeChange?.(themeSelect.value as "system" | "light" | "dark"));
  shortcutEdit.addEventListener("change", () => options.onShortcutChange?.("jumpLatest", shortcutEdit.value));
  shortcutSearch.addEventListener("change", () => options.onShortcutChange?.("search", shortcutSearch.value));
  exportBtn.addEventListener("click", () => options.onExport?.());
  orphanBtn.addEventListener("click", () => options.onRemoveOrphanThread?.());
  showDebug.addEventListener("change", () => options.onShowDebugChange?.(showDebug.checked));
  for (const key of FEATURE_KEYS) {
    featureInputs[key].addEventListener("change", () => {
      features = { ...features, [key]: featureInputs[key].checked };
      applyFeatures();
      options.onFeatureChange?.(key, featureInputs[key].checked);
    });
  }
  gear.addEventListener("click", () => applySettings(!settingsOpen));
  searchInput.addEventListener("input", () => {
    applyTab("search");
    options.onSearch?.(searchInput.value);
  });

  const bindArrowNav = <T,>(listEl: HTMLElement, getRows: () => T[], pick: (row: T) => void) => {
    listEl.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const items = [...listEl.querySelectorAll("li")];
      if (items.length === 0) return;
      const current = items.findIndex((item) => item.classList.contains("cn-active"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const from = current < 0 ? 0 : current;
        const next = event.key === "ArrowDown" ? Math.min(items.length - 1, from + 1) : Math.max(0, from - 1);
        items.forEach((item, index) => item.classList.toggle("cn-active", index === next));
        const row = getRows()[next];
        if (row) pick(row);
      }
      if (event.key === "Enter") {
        const row = getRows()[Math.max(0, current)];
        if (row) pick(row);
      }
    });
  };
  bindArrowNav(list, () => promptRows, (row) => options.onPromptClick?.(row));
  bindArrowNav(outlineList, () => outlineRows, (row) => options.onOutlineClick?.(row));
  bindArrowNav(bookmarkList, () => bookmarkRows, (row) => options.onBookmarkClick?.(row));
  bindArrowNav(searchList, () => searchRows, (row) => options.onSearchHit?.(row));

  const tabFeature: Record<Exclude<NavigatorTab, "settings">, FeatureKey> = {
    prompts: "promptNavigator",
    outline: "answerOutline",
    bookmarks: "bookmarks",
    search: "search",
  };

  const firstEnabledTab = (): Exclude<NavigatorTab, "settings"> => {
    for (const tab of tabs) {
      if (features[tabFeature[tab]]) return tab;
    }
    return "prompts";
  };

  const applyFeatures = () => {
    for (const btn of tabBar.querySelectorAll<HTMLButtonElement>("button")) {
      const tab = btn.dataset.tab as Exclude<NavigatorTab, "settings">;
      btn.hidden = !features[tabFeature[tab]];
    }
    searchField.hidden = !features.search;
    bookmarkBtn.hidden = !features.bookmarks;
    bookmarkTurn.hidden = !features.bookmarks;
    bookmarkMsg.hidden = !features.bookmarks;
    bookmarkHd.hidden = !features.bookmarks;
    prevBtn.hidden = !features.promptNavigator;
    nextBtn.hidden = !features.promptNavigator;
    jumpLatest.hidden = !features.promptNavigator;
    keymap.hidden = !features.keyboardShortcuts;
    if (!settingsOpen) applyTab(features[tabFeature[activeTab as Exclude<NavigatorTab, "settings">]] ? (activeTab as Exclude<NavigatorTab, "settings">) : firstEnabledTab());
  };

  applyTab("prompts");
  applyFeatures();

  return {
    root,
    searchInput,
    setStatus(text: string) {
      status.textContent = text;
      root.dataset.cnStatus = text;
    },
    setThreadId(id: string | null) {
      thread.textContent = `threadId: ${id ?? "—"}`;
      if (id) threadSelect.value = id;
    },
    setPrompts(rows, message) {
      promptRows = rows;
      list.replaceChildren();
      if (rows.length === 0 && activeTab === "prompts") {
        empty.hidden = false;
        empty.textContent = message ?? "暂无 User Prompt。";
        return;
      }
      if (activeTab === "prompts") empty.hidden = true;
      for (const row of rows) {
        const item = el("li", { class: "cn-prompt", "data-turn-id": row.turnId }, [
          el("span", { class: "cn-idx" }, [String((row.itemIndex ?? 0) + 1).padStart(2, "0")]),
          el("span", { class: "cn-title" }, [row.title]),
        ]);
        if (row.itemId) item.dataset.itemId = row.itemId;
        if (row.bookmarked) item.classList.add("cn-starred");
        item.addEventListener("click", () => options.onPromptClick?.(row));
        list.append(item);
      }
    },
    setActiveTurn(turnId: string | null) {
      root.dataset.activeTurn = turnId ?? "";
      for (const item of list.querySelectorAll("li")) {
        item.classList.toggle("cn-active", Boolean(turnId) && item.getAttribute("data-turn-id") === turnId);
      }
      const active = list.querySelector("li.cn-active");
      if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
    },
    setBookmarks(rows) {
      bookmarkRows = rows;
      bookmarkList.replaceChildren();
      for (const row of rows) {
        const item = el("li", { class: "cn-bookmark", "data-turn-id": row.turnId, "data-kind": row.kind, "data-id": row.id }, []);
        if (row.headingId) item.dataset.headingId = row.headingId;
        if (row.orphaned) {
          item.classList.add("cn-orphaned");
          item.dataset.orphaned = "true";
        }
        const label = el("span", { class: "cn-title" }, [
          `${row.orphaned ? "[orphaned] " : ""}${row.kind} · ${row.title}`,
        ]);
        const rename = el("button", { type: "button", class: "cn-btn cn-btn-quiet" }, ["Rename"]);
        const del = el("button", { type: "button", class: "cn-btn cn-btn-quiet" }, ["Delete"]);
        rename.addEventListener("click", (event) => {
          event.stopPropagation();
          const next = window.prompt("Bookmark name", row.title);
          if (next) options.onRenameBookmark?.(row.id, next);
        });
        del.addEventListener("click", (event) => {
          event.stopPropagation();
          options.onDeleteBookmark?.(row.id);
        });
        item.append(label, rename, del);
        item.addEventListener("click", () => options.onBookmarkClick?.(row));
        bookmarkList.append(item);
      }
      if (activeTab === "bookmarks") empty.hidden = rows.length > 0;
    },
    setOutline(rows) {
      outlineRows = rows;
      outlineList.replaceChildren();
      for (const row of rows) {
        const item = el("li", { class: `cn-outline cn-h${row.level}`, "data-heading-id": row.id }, [
          el("span", { class: "cn-h-mark" }, [`H${row.level}`]),
          el("span", { class: "cn-title" }, [row.text]),
        ]);
        item.addEventListener("click", () => options.onOutlineClick?.(row));
        outlineList.append(item);
      }
      if (activeTab === "outline") {
        empty.hidden = rows.length > 0;
        empty.textContent = rows.length ? "" : "当前可见回答没有显式 h1–h4。";
      }
    },
    setSearchHits(rows) {
      searchRows = rows;
      searchList.replaceChildren();
      for (const row of rows) {
        const item = el("li", { class: "cn-hit-row", "data-turn-id": row.turnId }, [row.snippet]);
        item.addEventListener("click", () => options.onSearchHit?.(row));
        searchList.append(item);
      }
      if (activeTab === "search") empty.hidden = rows.length > 0;
    },
    setEnabled(value: boolean) {
      enable.checked = value;
    },
    setVisible(next: boolean) {
      visible = next;
      root.hidden = !next;
    },
    isVisible() {
      return visible && !root.hidden;
    },
    setTab(tab) {
      if (tab === "settings") applySettings(true);
      else applyTab(tab);
    },
    setSettingsOpen(open) {
      applySettings(open);
    },
    setFeatures(next) {
      features = mergeFeatures(next);
      for (const key of FEATURE_KEYS) featureInputs[key].checked = features[key];
      applyFeatures();
    },
    setFollow(following: boolean, unreadNew: boolean) {
      followBadge.textContent = following ? "Follow ON" : "Follow OFF";
      followBadge.dataset.following = following ? "true" : "false";
      newContent.hidden = !unreadNew;
    },
    focusSearch() {
      applyTab("search");
      searchInput.focus();
    },
    closeSearch() {
      searchInput.blur();
      searchInput.value = "";
      if (searchOpen) applyTab("prompts");
    },
    setThreads(threads, currentId) {
      threadSelect.replaceChildren();
      for (const item of threads) {
        const opt = document.createElement("option");
        opt.value = item.threadId;
        opt.textContent = item.live ? item.title : `${item.title} (removed)`;
        threadSelect.append(opt);
      }
      if (currentId) threadSelect.value = currentId;
    },
    setShortcuts(rows) {
      keymap.replaceChildren();
      for (const row of rows) {
        keymap.append(el("li", {}, [el("kbd", { class: "cn-kbd" }, [row.chord]), el("span", { class: "cn-cap" }, [row.label])]));
      }
    },
  };
}

/* Official Codex/ChatGPT-adjacent: system UI, low contrast, no M3 capsules. */
export const NAVIGATOR_PANEL_CSS = `
.codex-navigator {
  --cn-primary: #ececec;
  --cn-on-primary: #111;
  --cn-surface: #171717;
  --cn-surface-high: #171717;
  --cn-surface-highest: #2a2a2a;
  --cn-outline: #2f2f2f;
  --cn-on-surface: #ececec;
  --cn-on-variant: #8a8a8a;
  --cn-accent: #ececec;
  --cn-star: #c9c9c9;
  width: var(--cn-width, 220px);
  min-width: 180px;
  max-width: 320px;
  height: 100vh;
  overflow: auto;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  color: var(--cn-on-surface);
  background: var(--cn-surface-high);
  border-left: 1px solid var(--cn-outline);
  border-radius: 0;
  padding: 10px 8px;
  box-shadow: none;
  position: relative;
  display: flex;
  flex-direction: column;
}
.codex-navigator[hidden],
.cn-settings[hidden],
.cn-list[hidden],
.cn-empty[hidden] { display: none !important; }
.cn-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.cn-brand { display: flex; flex-direction: column; gap: 2px; }
.cn-header-actions { display: flex; gap: 4px; }
.cn-gear[aria-pressed="true"] { background: #2a2a2a; }
.cn-brand strong { font-size: 13px; font-weight: 600; }
.cn-settings-title { font-size: 13px; margin: 8px 0 6px; font-weight: 600; }
html:not([data-debug="true"]) .cn-debug { display: none !important; }
.cn-cap { font-size: 11px; color: var(--cn-on-variant); display: block; font-weight: 400; }
.cn-tabs { display: flex; flex-wrap: wrap; gap: 0; margin: 6px 0; border-bottom: 1px solid var(--cn-outline); }
.cn-tabs button {
  font: inherit; padding: 6px 8px; border-radius: 0; border: 0;
  background: transparent; color: var(--cn-on-variant);
}
.cn-tabs button[aria-selected="true"] { color: var(--cn-on-surface); box-shadow: inset 0 -1px 0 #ececec; }
.cn-list { margin: 0; padding: 0; list-style: none; flex: 1; max-height: 48vh; overflow: auto; }
.cn-list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.cn-list li:hover { background: #1c1c1c; }
.cn-list li.cn-active { background: #2a2a2a; }
.cn-prompt .cn-idx { flex: 0 0 1.5rem; font-variant-numeric: tabular-nums; color: var(--cn-on-variant); font-size: 11px; }
.cn-prompt .cn-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cn-list li.cn-starred::after { content: "★"; margin-left: auto; color: var(--cn-star); font-size: 11px; }
.cn-list li.cn-orphaned { opacity: 0.65; }
.cn-outline.cn-h1 { padding-left: 8px; }
.cn-outline.cn-h2 { padding-left: 18px; }
.cn-outline.cn-h3 { padding-left: 28px; }
.cn-outline.cn-h4 { padding-left: 38px; }
.cn-h-mark { flex: 0 0 auto; font-size: 10px; color: var(--cn-on-variant); }
.cn-search-field {
  display: flex; align-items: center; gap: 8px; margin: 6px 0;
  padding: 0 8px; min-height: 32px; border-radius: 6px;
  background: #111; border: 1px solid var(--cn-outline);
}
.cn-search { flex: 1; border: 0; background: transparent; color: inherit; font: inherit; outline: none; padding: 6px 0; }
.cn-select, .cn-field {
  width: 100%; box-sizing: border-box; margin: 4px 0; min-height: 30px;
  border-radius: 6px; border: 1px solid var(--cn-outline);
  background: #111; color: inherit; font: inherit; padding: 4px 8px;
}
.cn-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.cn-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin: 4px 0 8px; }
.cn-status, .cn-thread, .cn-empty, .cn-enable, .cn-keymap-title, .cn-follow { margin: 0; color: var(--cn-on-variant); font-size: 12px; }
.cn-keymap { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.cn-keymap li { display: flex; align-items: baseline; gap: 10px; border: 0; padding: 0; cursor: default; }
.cn-kbd { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 5px; border-radius: 4px; background: #2a2a2a; }
.cn-footer, .cn-settings { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.cn-setting-row, .cn-feature-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
.cn-feature-copy { display: flex; flex-direction: column; gap: 2px; }
.cn-feature-list { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.cn-btn {
  font: inherit; padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--cn-outline); background: #111; color: inherit;
}
.cn-btn-quiet { padding: 2px 6px; font-size: 11px; }
.cn-new { background: #2a2a2a; }
.cn-bookmark .cn-title { flex: 1; min-width: 0; }
.cn-resize { position: absolute; left: 0; top: 12px; width: 6px; height: calc(100% - 24px); cursor: ew-resize; }
html[data-theme="light"] .codex-navigator {
  --cn-surface: #f7f7f8; --cn-surface-high: #f7f7f8; --cn-surface-highest: #ececec;
  --cn-outline: #e5e5e5; --cn-on-surface: #111; --cn-on-variant: #6b6b6b;
}
`;
