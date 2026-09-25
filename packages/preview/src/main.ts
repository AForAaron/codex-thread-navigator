import { createCodexCurrentAdapter } from "../../core/src/adapters/codex-current.ts";
import type { DomAdapter } from "../../core/src/adapters/types.ts";
import { bookmarkId, preferBookmarkKind, type BookmarkIndex, type BookmarkKind } from "../../core/src/bookmarks/types.ts";
import { exportForbiddenKeys } from "../../core/src/export/export.ts";
import { compensateScroll, distanceFromBottom, reduceFollow, type FollowState } from "../../core/src/follow/follow.ts";
import {
  PREVIEW_DEFAULT_SHORTCUTS,
  isEditableTarget,
  matchPreviewShortcut,
  parseShortcut,
  type ShortcutId,
} from "../../core/src/keymap/shortcuts.ts";
import { extractHeadings, type OutlineHeading } from "../../core/src/outline/headings.ts";
import { restoreReadingPosition } from "../../core/src/reading/restore.ts";
import type { ReadingAnchor } from "../../core/src/reading/types.ts";
import { searchTurns } from "../../core/src/search/search.ts";
import { createNavigatorPanel, NAVIGATOR_PANEL_CSS } from "../../plugin/src/ui/navigator-panel.ts";
import {
  PREVIEW_FIXTURES,
  PREVIEW_LAST_USER_TURN,
  THREAD_MAIN,
  THREAD_ORPHAN,
  defaultCatalog,
  type ThreadCatalogEntry,
} from "./fixture.ts";
import { FEATURE_KEYS, FEATURE_META, mergeFeatures, type FeatureKey } from "../../core/src/features/flags.ts";
import { disconnectedQuota, fixtureSessionQuota, formatQuotaLine, type SessionQuota } from "../../core/src/quota/session-quota.ts";
import { applyShortcutOverrides, createPreviewStorage } from "./storage.ts";
import { createProgressRail, PROGRESS_RAIL_CSS } from "./progress-rail.ts";
import { createThreadRail, THREAD_RAIL_CSS } from "./sidebar.ts";
import { appendGeneratedBlock, renderPreviewThread } from "./thread-view.ts";

const PREVIEW_CSS = `
:root { color-scheme: dark; --cn-width: 220px; }
html, body, #app {
  margin: 0; height: 100%; overflow: hidden;
  background: #212121; color: #ececec;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
html[data-theme="light"] { color-scheme: light; background: #fff; color: #111; }
html[data-theme="light"] body, html[data-theme="light"] #app { background: #fff; color: #111; }
.preview-shell { display: flex; height: 100vh; max-height: 100vh; overflow: hidden; background: #212121; }
html[data-theme="light"] .preview-shell { background: #fff; }
.preview-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.preview-topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 16px; border-bottom: 1px solid #2f2f2f; }
.preview-banner { margin: 0; font-size: 11px; color: #8a8a8a; }
.preview-mini-gear {
  font: 13px system-ui; width: 28px; height: 28px; padding: 0;
  border: 0; background: transparent; color: #8a8a8a; cursor: pointer; border-radius: 6px;
}
.preview-mini-gear:hover, .preview-mini-gear[aria-expanded="true"] { background: #2a2a2a; color: #ececec; }
.preview-mini-pop {
  position: absolute; right: 0; top: 32px; z-index: 20; width: 260px;
  background: #171717; border: 1px solid #2f2f2f; border-radius: 8px; padding: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
.preview-mini-pop[hidden] { display: none !important; }
.preview-mini-pop label { display: flex; align-items: flex-start; gap: 8px; padding: 5px 4px; font-size: 12px; }
.preview-mini-pop strong { font-weight: 500; }
.preview-mini-pop .cn-cap { display: block; color: #8a8a8a; font-weight: 400; }
.preview-thread-host { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.preview-scroll-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.app-shell-main-content-viewport { flex: 1; min-height: 0; height: 100%; overflow: auto; padding: 8px 28px 24px; scrollbar-width: none; }
.app-shell-main-content-viewport::-webkit-scrollbar { width: 0; height: 0; }
.app-shell-main-content-viewport > h1 { font-size: 18px; font-weight: 600; margin: 12px 0 16px; }
.preview-turn { margin: 12px 0; padding: 10px 12px; border-radius: 12px; max-width: 46rem; }
.preview-turn-user { background: #2f2f2f; }
html[data-visual-hints="true"] .preview-turn-user { border-left: 2px solid #8a8a8a; }
.preview-turn-assistant { background: transparent; }
.preview-turn.cn-current { background: #2a2a2a; }
.preview-turn.cn-hit { outline: 1px solid #8a8a8a; }
html[data-theme="light"] .preview-turn-user { background: #f4f4f4; }
html[data-theme="light"] .preview-turn.cn-current { background: #eee; }
.preview-turn-meta { opacity: 0.5; font-size: 11px; margin-bottom: 6px; }
.preview-side { display: flex; flex-direction: column; min-height: 0; }
.preview-side[hidden] { display: none !important; }
.preview-show {
  font: 12px system-ui; padding: 4px 8px; align-self: flex-end;
  border-radius: 6px; border: 1px solid #2f2f2f; background: #171717; color: inherit;
}
.preview-composer-zone { border-top: 1px solid #2f2f2f; padding: 8px 16px 12px; flex: 0 0 auto; }
.cn-quota {
  display: flex; flex-direction: column; gap: 4px; margin: 0 0 8px;
  font-size: 12px; color: #8a8a8a;
}
.cn-quota[hidden] { display: none !important; }
.cn-quota-track { height: 3px; background: #2f2f2f; border-radius: 2px; overflow: hidden; }
.cn-quota-fill { height: 100%; width: 0; background: #ececec; }
.cn-quota[data-connected="false"] .cn-quota-fill { width: 0; background: #444; }
.preview-composer {
  border: 1px solid #3d3d3d; border-radius: 12px; min-height: 44px; padding: 10px 12px;
  background: #2f2f2f; color: #8a8a8a;
}
${THREAD_RAIL_CSS}
${PROGRESS_RAIL_CSS}
${NAVIGATOR_PANEL_CSS}
`;

function ensureStyle(): void {
  if (document.getElementById("cn-preview-style")) return;
  const style = document.createElement("style");
  style.id = "cn-preview-style";
  style.textContent = PREVIEW_CSS;
  document.head.append(style);
}

function visibleTurn(viewport: HTMLElement, testId?: string): HTMLElement | null {
  const selector = testId ? `[data-testid="${testId}"]` : ".preview-turn";
  const nodes = [...viewport.querySelectorAll<HTMLElement>(selector)];
  const root = viewport.getBoundingClientRect();
  let best: { node: HTMLElement; dist: number } | null = null;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < root.top + 8 || rect.top > root.bottom - 8) continue;
    const dist = Math.abs(rect.top - root.top);
    if (!best || dist < best.dist) best = { node, dist };
  }
  return best?.node ?? null;
}

function currentUserFromIO(viewport: HTMLElement): string | null {
  return visibleTurn(viewport, "user-message")?.dataset.turnId ?? null;
}

function visibleHeadingId(viewport: HTMLElement): string | null {
  const root = viewport.getBoundingClientRect();
  const heads = [...viewport.querySelectorAll<HTMLElement>("h1,h2,h3,h4")].filter((node) => node.id);
  let best: { id: string; dist: number } | null = null;
  for (const node of heads) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < root.top + 8 || rect.top > root.bottom - 8) continue;
    const dist = Math.abs(rect.top - root.top);
    if (!best || dist < best.dist) best = { id: node.id, dist };
  }
  return best?.id ?? null;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

function applyTheme(theme: "system" | "light" | "dark"): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function applyDebug(enabled: boolean): void {
  document.documentElement.dataset.debug = enabled ? "true" : "false";
}

function makeAdapter(threadId: string): DomAdapter {
  return createCodexCurrentAdapter(
    document,
    { pathname: `/thread/${threadId}`, href: `https://preview.local/thread/${threadId}` },
    "preview",
  );
}

async function main(): Promise<void> {
  ensureStyle();
  const app = document.getElementById("app") ?? document.body;
  app.replaceChildren();
  const storage = createPreviewStorage();
  const prefs = storage.loadPrefs();
  if (!prefs.removedThreadIds) prefs.removedThreadIds = [];
  if (prefs.showDebug == null) prefs.showDebug = false;
  prefs.features = mergeFeatures(prefs.features);
  if (new URLSearchParams(location.search).get("nav") === "1") {
    prefs.features = mergeFeatures({
      ...prefs.features,
      promptNavigator: true,
      answerOutline: true,
      bookmarks: true,
      search: true,
    });
  }
  applyTheme(prefs.theme);
  applyDebug(prefs.showDebug);
  document.documentElement.dataset.visualHints = prefs.features.visualHints ? "true" : "false";
  document.documentElement.style.setProperty("--cn-width", `${prefs.panelWidth}px`);

  let catalog: ThreadCatalogEntry[] = defaultCatalog().map((row) => ({
    ...row,
    live: !prefs.removedThreadIds.includes(row.threadId),
  }));
  let currentThreadId = catalog.some((row) => row.threadId === THREAD_MAIN && row.live)
    ? THREAD_MAIN
    : catalog.find((row) => row.live)?.threadId ?? THREAD_MAIN;
  let viewport!: HTMLElement;
  let adapter = makeAdapter(currentThreadId);
  let gen = 0;
  let lastScrollTop = 0;
  let follow: FollowState = { following: true, unreadNew: false };
  let bindings = applyShortcutOverrides(PREVIEW_DEFAULT_SHORTCUTS, prefs.shortcutOverrides, parseShortcut);
  let outlineCount = 0;
  let lastExportLeaks: string[] = [];
  let observer: MutationObserver | null = null;

  const shell = document.createElement("div");
  shell.className = "preview-shell";
  const mainCol = document.createElement("div");
  mainCol.className = "preview-main";
  const banner = document.createElement("div");
  banner.className = "preview-banner";
  banner.textContent = "预览 · 不是 Codex Desktop";
  const threadHost = document.createElement("div");
  threadHost.className = "preview-thread-host";
  const scrollPane = document.createElement("div");
  scrollPane.className = "preview-scroll-pane";
  const progress = createProgressRail({
    onJump: (turnId) => jumpTo(turnId),
  });
  threadHost.append(scrollPane, progress.root);
  const topbar = document.createElement("div");
  topbar.className = "preview-topbar";
  topbar.style.position = "relative";
  const miniGear = document.createElement("button");
  miniGear.type = "button";
  miniGear.className = "preview-mini-gear";
  miniGear.dataset.cn = "mini-settings";
  miniGear.setAttribute("aria-label", "设置");
  miniGear.setAttribute("aria-expanded", "false");
  miniGear.textContent = "⚙";
  const miniPop = document.createElement("div");
  miniPop.className = "preview-mini-pop";
  miniPop.dataset.cn = "mini-settings-pop";
  miniPop.hidden = true;
  for (const key of FEATURE_KEYS) {
    const row = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.cnMiniFeature = key;
    box.checked = prefs.features[key];
    const copy = document.createElement("span");
    copy.innerHTML = `<strong>${FEATURE_META[key].label}</strong><span class="cn-cap">${FEATURE_META[key].hint}</span>`;
    row.append(box, copy);
    miniPop.append(row);
  }
  const miniWrap = document.createElement("div");
  miniWrap.style.position = "relative";
  miniWrap.append(miniGear, miniPop);
  topbar.append(banner, miniWrap);
  const quota = document.createElement("div");
  quota.className = "cn-quota";
  quota.dataset.cn = "quota-bar";
  quota.dataset.zone = "aboveComposer";
  quota.innerHTML = `<span data-cn="quota-label"></span><div class="cn-quota-track"><div class="cn-quota-fill" data-cn="quota-fill"></div></div>`;
  const composer = document.createElement("div");
  composer.className = "preview-composer";
  composer.setAttribute("data-above-composer-portal", "true");
  composer.innerHTML = `<div class="ProseMirror" contenteditable="false">输入消息</div>`;
  const composerZone = document.createElement("div");
  composerZone.className = "preview-composer-zone";
  composerZone.append(quota, composer);
  mainCol.append(topbar, threadHost, composerZone);
  const side = document.createElement("div");
  side.className = "preview-side";
  const rail = createThreadRail({
    activeThreadId: currentThreadId,
    onThread: (threadId) => void switchThread(threadId),
  });
  shell.append(rail.root, mainCol, side);
  app.append(shell);

  const showBtn = document.createElement("button");
  showBtn.type = "button";
  showBtn.className = "preview-show";
  showBtn.dataset.cn = "show";
  showBtn.textContent = "显示 Navigator";
  showBtn.hidden = true;

  const panel = createNavigatorPanel({
    enabled: true,
    shortcuts: bindings,
    threads: catalog,
    currentThreadId,
    autoRestore: prefs.autoRestore,
    theme: prefs.theme,
    showDebug: prefs.showDebug,
    features: prefs.features,
    onFeatureChange: (key, enabled) => {
      setFeature(key, enabled);
    },
    onToggleEnabled: (enabled) => {
      panel.setVisible(enabled);
      syncShowBtn();
      publishState();
    },
    onJumpLatest: () => jumpLatest(),
    onRefresh: () => void refreshPrompts(),
    onCollapse: () => {
      panel.setVisible(false);
      panel.setEnabled(false);
      syncShowBtn();
      publishState();
    },
    onPromptClick: (row) => jumpTo(row.turnId),
    onBookmarkClick: (row) => jumpBookmark(row),
    onPrevPrompt: () => movePrompt(-1),
    onNextPrompt: () => movePrompt(1),
    onBookmark: (kind) => addBookmark(kind),
    onRenameBookmark: (id, title) => {
      storage.renameBookmark(id, title);
      refreshBookmarks();
    },
    onDeleteBookmark: (id) => {
      storage.removeBookmark(id);
      refreshBookmarks();
    },
    onOutlineClick: (row) => jumpHeading(row),
    onSearch: (query) => runSearch(query),
    onSearchHit: (hit) => {
      jumpTo(hit.turnId);
      const node = viewport.querySelector(`[data-turn-id="${hit.turnId}"]`);
      node?.classList.add("cn-hit");
      window.setTimeout(() => node?.classList.remove("cn-hit"), 1200);
    },
    onThreadChange: (threadId) => void switchThread(threadId),
    onAutoRestoreChange: (enabled) => {
      prefs.autoRestore = enabled;
      storage.savePrefs(prefs);
      panel.setStatus(enabled ? "已打开自动恢复" : "已关闭自动恢复");
      publishState();
    },
    onThemeChange: (theme) => {
      prefs.theme = theme;
      storage.savePrefs(prefs);
      applyTheme(theme);
      publishState();
    },
    onShowDebugChange: (enabled) => {
      prefs.showDebug = enabled;
      storage.savePrefs(prefs);
      applyDebug(enabled);
      publishState();
    },
    onShortcutChange: (id, chord) => {
      if (id !== "jumpLatest" && id !== "search") return;
      prefs.shortcutOverrides = { ...prefs.shortcutOverrides, [id as ShortcutId]: chord };
      storage.savePrefs(prefs);
      bindings = applyShortcutOverrides(PREVIEW_DEFAULT_SHORTCUTS, prefs.shortcutOverrides, parseShortcut);
      panel.setShortcuts(bindings);
      panel.setStatus(`快捷键已改：${id} = ${chord}`);
      publishState();
    },
    onExport: () => {
      const data = storage.exportIndex(catalog.map((row) => ({ threadId: row.threadId, title: row.title })));
      lastExportLeaks = exportForbiddenKeys(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "codex-navigator-export.json";
      a.click();
      panel.setStatus(lastExportLeaks.length ? `Export 含禁止字段 ${lastExportLeaks.join(",")}` : "已导出索引（无正文）");
      publishState();
    },
    onRemoveOrphanThread: () => {
      if (!prefs.removedThreadIds.includes(THREAD_ORPHAN)) prefs.removedThreadIds.push(THREAD_ORPHAN);
      storage.savePrefs(prefs);
      catalog = catalog.map((row) => (row.threadId === THREAD_ORPHAN ? { ...row, live: false } : row));
      panel.setThreads(catalog, currentThreadId);
      storage.applyOrphans(liveIds());
      refreshBookmarks();
      panel.setStatus("Orphan thread 已移出目录，书签保留并标记 orphaned");
      publishState();
    },
    onSimulateGenerate: () => simulateGenerate(),
    onJumpNewContent: () => jumpNewest(),
  });

  const resize = document.createElement("div");
  resize.className = "cn-resize";
  resize.dataset.cn = "resize";
  panel.root.append(resize);
  resize.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = panel.root.getBoundingClientRect().width;
    const move = (next: MouseEvent) => {
      const width = Math.min(520, Math.max(240, startW - (next.clientX - startX)));
      prefs.panelWidth = width;
      document.documentElement.style.setProperty("--cn-width", `${width}px`);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      storage.savePrefs(prefs);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });

  showBtn.addEventListener("click", () => {
    panel.setVisible(true);
    panel.setEnabled(true);
    syncShowBtn();
    publishState();
  });
  miniGear.addEventListener("click", (event) => {
    event.stopPropagation();
    miniPop.hidden = !miniPop.hidden;
    miniGear.setAttribute("aria-expanded", miniPop.hidden ? "false" : "true");
  });
  document.addEventListener("click", (event) => {
    if (miniPop.hidden) return;
    const target = event.target as Node | null;
    if (target && (miniPop.contains(target) || miniGear.contains(target))) return;
    miniPop.hidden = true;
    miniGear.setAttribute("aria-expanded", "false");
  });
  for (const box of miniPop.querySelectorAll<HTMLInputElement>("input[data-cn-mini-feature]")) {
    box.addEventListener("change", () => {
      const key = box.dataset.cnMiniFeature as FeatureKey;
      setFeature(key, box.checked);
    });
  }
  side.append(showBtn, panel.root);

  function syncShowBtn(): void {
    showBtn.hidden = panel.isVisible();
  }

  function liveIds(): string[] {
    return catalog.filter((row) => row.live).map((row) => row.threadId);
  }

  function syncLock(): void {
    adapter.lockViewport?.(follow.following);
  }

  function publishState(): void {
    const bookmarks = storage.listAllBookmarks();
    (window as unknown as { __CN_PREVIEW__?: Record<string, unknown> }).__CN_PREVIEW__ = {
      visible: panel.isVisible(),
      activeTurn: panel.root.dataset.activeTurn || (viewport ? currentUserFromIO(viewport) : null),
      promptCount: adapter.getScannedPrompts().length,
      bookmarks,
      bookmarkTurnIds: bookmarks.map((row) => row.turnId),
      status: panel.root.dataset.cnStatus ?? "",
      threadId: currentThreadId,
      follow,
      outlineCount,
      autoRestore: prefs.autoRestore,
      theme: prefs.theme,
      showDebug: prefs.showDebug,
      settingsOpen: !panel.root.querySelector<HTMLElement>('[data-cn-list="settings"]')?.hidden,
      exportLeaks: lastExportLeaks,
      searchFocused: document.activeElement === panel.searchInput,
      features: prefs.features,
      quota: quota.dataset.connected === "true" ? "fixture" : "disconnected",
      progress: {
        visible: !progress.root.hidden,
        previewOpen: progress.root.dataset.previewOpen === "true",
        hoverTurn: progress.root.dataset.hoverTurn ?? "",
        currentTurn: progress.root.dataset.currentTurn ?? "",
      },
    };
  }

  function renderQuota(data: SessionQuota): void {
    const label = quota.querySelector("[data-cn='quota-label']");
    const fill = quota.querySelector<HTMLElement>("[data-cn='quota-fill']");
    if (label) label.textContent = formatQuotaLine(data);
    quota.dataset.connected = data.connected ? "true" : "false";
    quota.dataset.source = data.source;
    if (fill) fill.style.width = data.remainingPercent != null ? `${data.remainingPercent}%` : "0";
  }

  function loadQuota(): void {
    const wantFixture = new URLSearchParams(location.search).get("quotaFixture") === "1";
    renderQuota(wantFixture ? fixtureSessionQuota() : disconnectedQuota());
  }

  function setFeature(key: FeatureKey, enabled: boolean): void {
    prefs.features = { ...prefs.features, [key]: enabled };
    storage.savePrefs(prefs);
    applyFeatureChrome();
    if (key === "readingRestore" && enabled) restoreSaved();
    publishState();
  }

  function applyFeatureChrome(): void {
    const f = prefs.features;
    document.documentElement.dataset.visualHints = f.visualHints ? "true" : "false";
    rail.setVisible(f.conversationRail);
    progress.setVisible(f.conversationProgress);
    quota.hidden = !f.quotaBar;
    const navOn = f.promptNavigator || f.answerOutline || f.bookmarks || f.search;
    side.hidden = !navOn;
    if (!navOn) {
      panel.setVisible(false);
      showBtn.hidden = true;
    } else if (!panel.isVisible()) {
      panel.setVisible(true);
      showBtn.hidden = true;
    }
    panel.setFeatures(f);
    for (const box of miniPop.querySelectorAll<HTMLInputElement>("input[data-cn-mini-feature]")) {
      const key = box.dataset.cnMiniFeature as FeatureKey;
      box.checked = f[key];
    }
    publishState();
  }

  function persistFromTurn(turnId: string): void {
    if (!prefs.features.readingRestore) return;
    if (!turnId) return;
    const item = adapter.getScannedPrompts().find((row) => row.turnId === turnId);
    const anchor: ReadingAnchor = {
      threadId: currentThreadId,
      turnId: item?.turnId ?? turnId,
      itemId: item?.itemId,
      itemIndex: item?.itemIndex,
      blockHash: item?.blockHash,
      contentHash: item?.contentHash,
      offset: viewport.scrollTop,
    };
    storage.saveAnchor(anchor);
  }

  function markCurrent(turnId: string): void {
    for (const node of viewport.querySelectorAll(".preview-turn")) {
      node.classList.toggle("cn-current", node.getAttribute("data-turn-id") === turnId);
    }
  }

  function jumpTo(turnId: string): void {
    adapter.jumpToPrompt({ turnId });
    panel.setActiveTurn(turnId);
    persistFromTurn(turnId);
    markCurrent(turnId);
    follow = { following: false, unreadNew: follow.unreadNew };
    panel.setFollow(follow.following, follow.unreadNew);
    syncLock();
    refreshOutline();
    publishState();
  }

  function jumpHeading(row: OutlineHeading): void {
    document.getElementById(row.id)?.scrollIntoView({ block: "start" });
    panel.setActiveTurn(row.turnId);
    persistFromTurn(currentUserFromIO(viewport) ?? row.turnId);
    follow = { following: false, unreadNew: follow.unreadNew };
    panel.setFollow(follow.following, follow.unreadNew);
    syncLock();
    panel.setStatus(`Outline → ${row.id}`);
    publishState();
  }

  function jumpBookmark(row: BookmarkIndex): void {
    if (row.headingId) {
      document.getElementById(row.headingId)?.scrollIntoView({ block: "start" });
    } else {
      adapter.jumpToPrompt({ turnId: row.turnId, itemId: row.itemId });
    }
    panel.setActiveTurn(row.turnId);
    panel.setStatus(`Bookmark → ${row.kind} ${row.title}`);
    publishState();
  }

  function movePrompt(delta: number): void {
    const prompts = adapter.getScannedPrompts();
    const current = currentUserFromIO(viewport) ?? panel.root.dataset.activeTurn ?? prompts[0]?.turnId;
    const index = prompts.findIndex((row) => row.turnId === current);
    const nextIndex = Math.max(0, Math.min(prompts.length - 1, (index < 0 ? 0 : index) + delta));
    const target = prompts[nextIndex];
    if (!target) return;
    jumpTo(target.turnId);
    panel.setStatus(`Prompt ${nextIndex + 1} · ${target.turnId}`);
  }

  function jumpLatest(): void {
    const lastUser = [...viewport.querySelectorAll<HTMLElement>('[data-testid="user-message"]')].at(-1);
    lastUser?.scrollIntoView({ block: "start" });
    const turnId = lastUser?.dataset.turnId ?? PREVIEW_LAST_USER_TURN;
    panel.setActiveTurn(turnId);
    persistFromTurn(turnId);
    markCurrent(turnId);
    follow = reduceFollow(follow, { type: "jumpLatest" });
    panel.setFollow(follow.following, follow.unreadNew);
    syncLock();
    panel.setStatus(`Jump Latest → ${turnId}`);
    publishState();
  }

  function jumpNewest(): void {
    const lastAny = [...viewport.querySelectorAll<HTMLElement>(".preview-turn")].at(-1);
    lastAny?.scrollIntoView({ block: "start" });
    const turnId = lastAny?.dataset.turnId ?? PREVIEW_LAST_USER_TURN;
    panel.setActiveTurn(turnId);
    persistFromTurn(currentUserFromIO(viewport) ?? turnId);
    follow = reduceFollow(follow, { type: "jumpLatest" });
    panel.setFollow(follow.following, follow.unreadNew);
    syncLock();
    panel.setStatus(`New content → ${turnId}`);
    publishState();
  }

  function headingForBookmark(): string | null {
    return (
      visibleHeadingId(viewport) ??
      viewport.querySelector<HTMLElement>(".preview-turn-html h1, .preview-turn-html h2, .preview-turn-html h3, .preview-turn-html h4")
        ?.id ??
      null
    );
  }

  function addBookmark(kind?: BookmarkKind): void {
    const heading = headingForBookmark();
    const resolved = kind ?? preferBookmarkKind(heading);
    const visible = visibleTurn(viewport);
    const turnId =
      resolved === "turn"
        ? currentUserFromIO(viewport) ?? adapter.getScannedPrompts().at(-1)?.turnId ?? "unknown"
        : visible?.dataset.turnId ?? currentUserFromIO(viewport) ?? adapter.getScannedPrompts().at(-1)?.turnId ?? "unknown";
    const item = adapter.getScannedPrompts().find((row) => row.turnId === turnId);
    const itemId = visible?.dataset.itemId ?? item?.itemId;
    const title =
      resolved === "heading" && heading
        ? document.getElementById(heading)?.textContent?.trim() || heading
        : item?.title || visible?.innerText.slice(0, 48) || turnId;
    const row: BookmarkIndex = {
      id: bookmarkId({
        threadId: currentThreadId,
        kind: resolved,
        turnId,
        itemId,
        headingId: resolved === "heading" ? heading ?? undefined : undefined,
      }),
      threadId: currentThreadId,
      kind: resolved,
      turnId,
      itemId,
      headingId: resolved === "heading" ? heading ?? undefined : undefined,
      blockHash: item?.blockHash,
      title,
      createdAt: Date.now(),
    };
    storage.addBookmark(row);
    refreshBookmarks();
    panel.setTab("bookmarks");
    panel.setStatus(`已收藏 ${row.kind} · ${row.title}`);
    publishState();
  }

  function refreshBookmarks(): void {
    const marked = storage.applyOrphans(liveIds());
    panel.setBookmarks(marked.filter((row) => row.threadId === currentThreadId || row.orphaned));
    void refreshPromptsStars();
  }

  async function refreshPromptsStars(): Promise<void> {
    const listed = await adapter.listUserPrompts();
    if (!listed.ok) return;
    const stars = new Set(storage.listBookmarks(currentThreadId).map((row) => row.turnId));
    panel.setPrompts(
      listed.value.map((row) => ({
        title: row.title,
        turnId: row.turnId,
        itemId: row.itemId,
        itemIndex: row.itemIndex,
        bookmarked: stars.has(row.turnId),
      })),
    );
  }

  function refreshOutline(): void {
    const assistant = visibleTurn(viewport, "assistant-message") ?? viewport.querySelector<HTMLElement>('[data-testid="assistant-message"]');
    if (!assistant) {
      outlineCount = 0;
      panel.setOutline([]);
      return;
    }
    const turnId = assistant.dataset.turnId ?? "";
    const headings = extractHeadings(assistant.querySelectorAll("h1,h2,h3,h4"), turnId, assistant.dataset.itemId);
    outlineCount = headings.length;
    panel.setOutline(headings);
  }

  function runSearch(query: string): void {
    const turns = [...viewport.querySelectorAll<HTMLElement>(".preview-turn")].map((node) => ({
      turnId: node.dataset.turnId ?? "",
      itemId: node.dataset.itemId,
      role: (node.dataset.role as "user" | "assistant") ?? "assistant",
      text: node.innerText,
    }));
    panel.setSearchHits(searchTurns(turns, query));
    publishState();
  }

  function simulateGenerate(): void {
    gen += 1;
    appendGeneratedBlock(viewport, gen);
  }

  function restoreSaved(): void {
    if (!prefs.features.readingRestore) {
      panel.setStatus("阅读位置已关闭");
      publishState();
      return;
    }
    if (!prefs.autoRestore) {
      panel.setStatus("自动恢复已关闭");
      publishState();
      return;
    }
    const saved = storage.loadAnchor(currentThreadId);
    const scanned = adapter.getScannedPrompts();
    if (!saved) {
      panel.setStatus(`User Prompts ${scanned.length} · 无已存锚点`);
      publishState();
      return;
    }
    const restored = restoreReadingPosition(saved, scanned);
    if (!restored.ok) {
      panel.setStatus("锚点无法恢复");
      publishState();
      return;
    }
    adapter.jumpToPrompt({
      turnId: restored.candidate.turnId,
      itemId: restored.candidate.itemId,
      itemIndex: restored.candidate.itemIndex,
      blockHash: restored.candidate.blockHash,
    });
    if (typeof saved.offset === "number") viewport.scrollTop = saved.offset;
    panel.setActiveTurn(restored.candidate.turnId);
    markCurrent(restored.candidate.turnId);
    panel.setStatus(`已恢复 ${restored.tier} · ${restored.candidate.turnId}`);
    refreshOutline();
    publishState();
  }

  async function refreshPrompts(): Promise<void> {
    const listed = await adapter.listUserPrompts();
    if (!listed.ok) {
      panel.setPrompts([], listed.message);
      panel.setStatus(listed.message);
      return;
    }
    const stars = new Set(storage.listBookmarks(currentThreadId).map((row) => row.turnId));
    panel.setPrompts(
      listed.value.map((row) => ({
        title: row.title,
        turnId: row.turnId,
        itemId: row.itemId,
        itemIndex: row.itemIndex,
        bookmarked: stars.has(row.turnId),
      })),
    );
    panel.setStatus(`User Prompts ${listed.value.length} · ${currentThreadId}`);
    publishState();
  }

  function bindViewport(): void {
    observer?.disconnect();
    lastScrollTop = viewport.scrollTop;
    let prevHeight = viewport.scrollHeight;
    let prevTop = viewport.scrollTop;
    observer = new MutationObserver(() => {
      if (prefs.features.viewportLock) {
        const next = compensateScroll({
          following: follow.following,
          previousScrollTop: prevTop,
          previousHeight: prevHeight,
          nextHeight: viewport.scrollHeight,
        });
        viewport.scrollTop = next.scrollTop;
      }
      follow = reduceFollow(follow, {
        type: "contentAppended",
        distanceFromBottom: distanceFromBottom(viewport.scrollTop, viewport.scrollHeight, viewport.clientHeight),
      });
      panel.setFollow(follow.following, follow.unreadNew);
      syncLock();
      prevHeight = viewport.scrollHeight;
      prevTop = viewport.scrollTop;
      panel.setStatus(follow.unreadNew ? "已生成新块（视口未拉走）" : "已生成并跟随");
      progress.sync();
      publishState();
    });
    observer.observe(viewport, { childList: true, subtree: false });

    const onScrollIdle = debounce(() => {
      const turnId = currentUserFromIO(viewport);
      if (turnId) {
        panel.setActiveTurn(turnId);
        persistFromTurn(turnId);
        markCurrent(turnId);
      }
      refreshOutline();
      publishState();
    }, 360);
    viewport.addEventListener("scroll", () => {
      const deltaY = viewport.scrollTop - lastScrollTop;
      lastScrollTop = viewport.scrollTop;
      prevTop = viewport.scrollTop;
      prevHeight = viewport.scrollHeight;
      follow = reduceFollow(follow, {
        type: "scroll",
        distanceFromBottom: distanceFromBottom(viewport.scrollTop, viewport.scrollHeight, viewport.clientHeight),
        deltaY,
      });
      panel.setFollow(follow.following, follow.unreadNew);
      syncLock();
      const turnId = currentUserFromIO(viewport);
      if (turnId) {
        panel.setActiveTurn(turnId);
        markCurrent(turnId);
      }
      progress.sync();
      onScrollIdle();
    });
    progress.attach(viewport);
    progress.sync();
  }

  async function mountThread(): Promise<void> {
    viewport = await renderPreviewThread(scrollPane, PREVIEW_FIXTURES[currentThreadId]!);
    viewport.style.flex = "1";
    viewport.style.minHeight = "0";
    adapter = makeAdapter(currentThreadId);
    bindViewport();
    panel.setThreadId(currentThreadId);
    await adapter.listUserPrompts();
    await refreshPrompts();
    refreshOutline();
    refreshBookmarks();
    syncLock();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        restoreSaved();
        progress.sync();
      }),
    );
  }

  async function switchThread(threadId: string): Promise<void> {
    persistFromTurn(currentUserFromIO(viewport) ?? panel.root.dataset.activeTurn ?? "");
    currentThreadId = threadId;
    rail.setActive(threadId);
    await mountThread();
  }

  applyFeatureChrome();
  loadQuota();
  window.setInterval(loadQuota, 45000);
  await mountThread();

  window.addEventListener("keydown", (event) => {
    if (!prefs.features.keyboardShortcuts) return;
    if (isEditableTarget(event.target) && event.key !== "Escape") return;
    const hit = matchPreviewShortcut(event, bindings);
    if (!hit) return;
    event.preventDefault();
    if (hit.id === "toggleNavigator") {
      const next = !panel.isVisible();
      panel.setVisible(next);
      panel.setEnabled(next);
      syncShowBtn();
      publishState();
      return;
    }
    if (hit.id === "escape") {
      if (document.activeElement === panel.searchInput || panel.searchInput.value) {
        panel.closeSearch();
        publishState();
        return;
      }
      panel.setVisible(false);
      panel.setEnabled(false);
      syncShowBtn();
      publishState();
      return;
    }
    if (hit.id === "search") {
      if (!prefs.features.search) return;
      panel.focusSearch();
      publishState();
      return;
    }
    if (hit.id === "jumpLatest") {
      jumpLatest();
      return;
    }
    if (hit.id === "bookmark") {
      if (!prefs.features.bookmarks) return;
      addBookmark();
      return;
    }
    movePrompt(hit.id === "prevPrompt" ? -1 : 1);
  });
  publishState();
}

void main();
