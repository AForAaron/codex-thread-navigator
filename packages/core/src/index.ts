export { ok, unavailable, type Capability, type CapabilityCode, type CapabilitySource } from "./capability.js";
export { sha256Hex, truncateTitle, truncatePromptTitle, MAX_TITLE_CHARS, PROMPT_TITLE_CHARS } from "./hash.js";
export { restoreReadingPosition } from "./reading/restore.js";
export type { ReadingAnchor, RestoreCandidate, RestoreResult, RestoreTier } from "./reading/types.js";
export {
  PREVIEW_DEFAULT_SHORTCUTS,
  matchPreviewShortcut,
  parseShortcut,
  type ShortcutBinding,
  type ShortcutId,
} from "./keymap/shortcuts.js";
export { createUnavailableAppServerClient } from "./appserver/client.js";
export { createExplodexAppServerClient, ExplodexAppServerClient } from "./appserver/explodex-bridge.js";
export {
  DOCUMENTED_APPSERVER_TYPES,
  isDocumentedAppServerType,
  type AppServerClient,
  type UserTurnIndex,
} from "./appserver/types.js";
export { CodexCurrentAdapter, CODEX_CURRENT_SELECTORS, createCodexCurrentAdapter, parseThreadIdFromPath } from "./adapters/codex-current.js";
export type { DomAdapter, PromptScanItem, SelectorPack } from "./adapters/types.js";
export { navigatorDataDir, navigatorDbPath } from "./persistence/paths.js";
export { openNavigatorDb, NavigatorDb } from "./persistence/db.js";
export {
  firstHeadingForTurn,
  firstMarkdownHeading,
  listLocalThreads,
  listLocalUserPrompts,
} from "./discovery/local-history.js";
export { indexLocalThread, saveLocalBookmarks, saveLocalReadingPosition } from "./discovery/anchors.js";
export { threadCatalogPath, threadHistoryPath } from "./discovery/paths.js";
export { extractHeadings, type OutlineHeading } from "./outline/headings.js";
export { searchTurns, type SearchHit, type SearchableTurn } from "./search/search.js";
export { compensateScroll, reduceFollow, viewportLockAllowed, FOLLOW_BOTTOM_PX } from "./follow/follow.js";
export { bookmarkId, markOrphanedBookmarks, preferBookmarkKind, type BookmarkIndex, type BookmarkKind } from "./bookmarks/types.js";
export { buildNavigatorExport, exportForbiddenKeys } from "./export/export.js";
export { clamp01, previewSnippet, previewTitle, ratioFromTurnIndex, turnIndexFromRatio } from "./reading/progress.js";
export { FEATURE_DEFAULTS, FEATURE_KEYS, FEATURE_META, mergeFeatures } from "./features/flags.js";
export type { FeatureFlags, FeatureKey } from "./features/flags.js";
export {
  disconnectedQuota,
  fixtureSessionQuota,
  formatQuotaLine,
  formatResetRemain,
} from "./quota/session-quota.js";
export type { QuotaSource, SessionQuota } from "./quota/session-quota.js";
