export const FEATURE_KEYS = [
  "conversationRail",
  "conversationProgress",
  "promptNavigator",
  "answerOutline",
  "bookmarks",
  "readingRestore",
  "viewportLock",
  "search",
  "keyboardShortcuts",
  "visualHints",
  "quotaBar",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

export const FEATURE_DEFAULTS: FeatureFlags = {
  conversationRail: true,
  conversationProgress: true,
  promptNavigator: false,
  answerOutline: false,
  bookmarks: false,
  readingRestore: true,
  viewportLock: true,
  search: true,
  keyboardShortcuts: true,
  visualHints: true,
  quotaBar: true,
};

export const FEATURE_META: Record<FeatureKey, { label: string; hint: string }> = {
  conversationRail: { label: "对话选择条", hint: "左侧像 Codex 一样选对话 / 项目。不放提问大纲或书签。" },
  conversationProgress: { label: "对话进度横条", hint: "对话区左缘的细进度。悬停出现横条和该轮预览，点击跳转。" },
  promptNavigator: { label: "提问目录", hint: "可选细目录，列出当前会话的 User Prompt。不替代左侧对话条。" },
  answerOutline: { label: "回答大纲", hint: "从当前回复的 h1–h4 生成目录。" },
  bookmarks: { label: "书签", hint: "按轮次 / 消息 / 标题收藏当前位置。" },
  readingRestore: { label: "阅读位置", hint: "记住并恢复本会话上次读到的轮次。" },
  viewportLock: { label: "阅读锁定", hint: "往上读时，新生成内容不把视口拽走。官方窗口里仍默认不改滚动。" },
  search: { label: "搜索", hint: "只搜当前已加载对话，不扫本机对话库。" },
  keyboardShortcuts: { label: "快捷键", hint: "页内快捷键。关掉后不拦截键盘。" },
  visualHints: { label: "轻微视觉区分", hint: "用户气泡左侧细线等。关掉则不加装饰。" },
  quotaBar: { label: "5h 额度条", hint: "输入框上方显示当前 5 小时会话额度。未接官方接口时显示未连接。" },
};

export function mergeFeatures(partial?: Partial<FeatureFlags> | null): FeatureFlags {
  return { ...FEATURE_DEFAULTS, ...(partial ?? {}) };
}
