# 架构

Codex Navigator 是 Codex Desktop 的**长对话导航层**。数据锚点是 thread / turn / item id；持久化是本机 SQLite 索引；UI 计划挂在 Explodex 运行时上。

```
┌─────────────────────────────────────────────────────────────┐
│ 本机索引（落地主路径，未注入）                                 │
│ tools/desktop-index.html · 只读 navigator.sqlite             │
│ 扫 ~/.codex 仅 npm run land（短连接后退出，默认关闭）         │
│ 官方窗口跳转：未接。不打开 ChatGPT.app / 不注入 Explodex      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ 开发 fixture 预览（不是产品主界面）                           │
│ tools/panel-preview.html · thread_preview_*                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ DomAdapter + 纯函数
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ packages/core                                               │
│  adapter / restoreReadingPosition / keymap / hash           │
│  persistence SQLite（Node，预览不用）                        │
└─────────────────────────────────────────────────────────────┘

以后才接（用户明确允许注入之后）：

┌─────────────────────────────────────────────────────────────┐
│ /Applications/ChatGPT.app  (bundle id com.openai.codex)     │
│ 未修改。Electron + app.asar。Explodex 文档称 Codex.app。      │
└───────────────▲─────────────────────────────────────────────┘
                │ 仅当用户主动运行 Explodex 时
┌───────────────┴─────────────────────────────────────────────┐
│ Explodex + ~/.explodex/plugins/codex-navigator              │
│ Phase 0 插件默认 inert                                      │
└─────────────────────────────────────────────────────────────┘
```

## 为什么有 Explodex 适配层却还不注入

官方 API 证据充分（`plugin.json` + `Explodex.plugins.register` + `api.mount(zoneId, …)` + `bridge.send`），但：

1. 本机没有 `/Applications/Codex.app`，Explodex launcher 按文档会 `open -a /Applications/Codex.app`
2. 真实 Desktop 是 ChatGPT.app 26.908，文档对照版本是 26.623，selector 未验证
3. 用户要求不得影响正在使用的 Codex 会话

因此 Phase 0–1 落地可独立运行的插件骨架 + 适配层。用户已选择 **继续无注入**。Phase 2 做实 Prompt / 锚点 / 快捷键；Phase 3–9 仍只在预览里补齐产品面。接 Desktop 的条件见 [PHASE2_PLAN.md](./PHASE2_PLAN.md) 与 [PHASE3_TO_9_PLAN.md](./PHASE3_TO_9_PLAN.md)。

## Explodex 已证实的表面

来源：https://github.com/dan-dr/explodex `docs/sdk-api.md`、`sdk/explodex-sdk.d.ts`（main `ab0aeab`）。

| API | 用途 | Navigator 用法 |
| --- | --- | --- |
| `Explodex.plugins.register(manifest, setup)` | 注册 | Phase 0 入口 |
| `api.mount(zoneId, factory)` | 挂 DOM | 仅当用户打开面板；zone=`statusOverlay` |
| `api.waitFor(zone)` | 路由后重挂 | 预留 |
| `api.registerOptions` | Explodex 设置页开关 | Phase 0 |
| `bridge.isAvailable / send / rpc` | AppServer / IPC | 适配层封装；**不发未文档化 type** |
| `codex.getThreadConversation(id)` | fiber 上的会话对象 | 需要已经有 id |
| `storage.persisted` | localStorage | 面板开关 |

**没有右侧栏 zone。** 已文档化 zones：`aboveComposer`、`aboveComposerQueue`、`mcpAppPortal`、`threadFooter`、`browserSidebarBanner`、`homeAmbient`、`sidebar`（左栏）、`composerActions`、`statusOverlay`。右侧 Navigator 暂用 `statusOverlay` 固定层，且默认关闭。

**没有**文档化的「列出当前 thread 用户消息」AppServer RPC。`listUserTurns` 对 AppServer 客户端返回 `UNVERIFIED_RPC`，真正的扫描走 `DomAdapter.listUserPrompts()`。

## 数据锚点

优先顺序：

1. 本机只读 `~/.codex/thread_history_*.sqlite` 的 `thread_id` / `turn_id` / `item_id`（不把 `item_json` 写入 navigator.sqlite）
2. 可选标题：`~/.codex/sqlite/codex-dev.db` 的 `local_thread_catalog.display_title`，以及 userMessage 前 30–50 字
3. 路由 `/thread/:conversationId` 与 DOM `data-turn-id`（官方窗口跳转仍未接）
4. 正文 SHA-256（只存 hash）
5. 不读 Cookies / auth.json / keychain；不把完整对话正文复制进 Navigator DB

## Phase 0–9

| Phase | 目标 | 本轮 |
| --- | --- | --- |
| 0 运行层 | 仓库、插件开关、Safe Mode、compatibility 表、不改 bundle | **做了** |
| 1 数据层 | AppServer 接口、DOM adapter、SQLite schema、数据目录 | **骨架做了** |
| 2 Prompt 导航 + 预览锚点/快捷键 | 独立预览做实 | **已做** |
| 3 多 thread 自动恢复 | 每 thread 独立锚点；可关自动恢复 | **本轮预览** |
| 4 Viewport Follow | 仅 preview 容器；adapter 默认 no-op | **本轮预览** |
| 5 Answer Outline | 显式 h1–h4，无 AI 分段 | **本轮预览** |
| 6 Bookmarks | Turn / Message / Heading + Rename | **本轮预览** |
| 7 Search | 已加载 turns 本地搜 | **本轮预览** |
| 8 UX | 强调、可改快捷键、拖宽、主题、方向键 | **本轮预览** |
| 9 Reliability | e2e / export / orphaned / verify | **本轮预览** |

## 模块

- `packages/core/src/adapters/codex-current.ts` — 唯一 selector 包；`lockViewport` 仅 `gate=preview`
- `packages/core/src/reading/restore.ts` — 阅读锚点多级 fallback（纯函数）
- `packages/core/src/follow/follow.ts` — Follow 状态机 + 滚动补偿（预览调用）
- `packages/core/src/outline/headings.ts` — 只抽显式 h1–h4
- `packages/core/src/search/search.ts` — 已加载 turns 本地字符串搜索
- `packages/core/src/bookmarks/types.ts` — Turn / Message / Heading + orphaned
- `packages/core/src/export/export.ts` — 索引导出，禁止正文键
- `packages/core/src/keymap/shortcuts.ts` — 快捷键解析（预览页内，非系统热键）
- `packages/core/src/appserver/` — 客户端；缺桥接时 `UnavailableAppServerClient`
- `packages/core/src/persistence/` — Node `node:sqlite`，不进预览 bundle
- `packages/preview/` — 多 thread fixture + 预览入口
- `packages/plugin/src/ui/navigator-panel.ts` — 右侧面板
- `packages/plugin/src/index.ts` — Explodex 入口；默认不 mount；本阶段不跑
- `vendor/explodex-sdk/explodex-sdk.d.ts` — 官方类型快照
