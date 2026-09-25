# Phase 2 计划：无注入预览里做实 Prompt / 锚点 / 快捷键

状态：用户已明确选择 **继续无注入开发**。本阶段只在独立预览中验证导航逻辑，等空闲再接 Codex Desktop。

## 目标

在系统浏览器里打开预览后，用**固定 fixture**（假 Thread/Turn ID）验证：

1. **Prompt Navigator**：右侧只列 User Prompt（标题 30–50 字）；点击滚到对应 Turn；IntersectionObserver 高亮当前 Turn；稳定渲染 80–100 条。
2. **阅读锚点**：滚动停止后保存 `threadId + turnId + itemIndex + blockHash + offset`；刷新后按 Turn+Item+Block → Turn+Item → Turn 恢复。浏览器用带 `codex-navigator-preview:` 前缀的 localStorage（只存索引）。`restoreReadingPosition()` 是 core 纯函数，可单测。
3. **预览页快捷键**（不注册系统级全局热键）：⌘⇧N 开关、⌘⇧↑/↓ 上一条/下一条、⌥⌘B 书签当前位置、⌘⇧L Latest、Esc 关面板。绑定可在预览里看见。
4. **Jump to Latest**。

## 非目标（本阶段明确不做）

| 不做 | 原因 |
| --- | --- |
| Outline UI | Phase 3 |
| Bookmark 完整产品（文件夹、排序、跨 thread） | 本阶段只写索引 + 侧栏简单列表 |
| Search | Phase 7 |
| Viewport Lock / Mutation 滚动拦截 | 容易伤真实 Codex，红线禁止 |
| Explodex 安装 / `explodex` CLI / CDP 注入 | 用户选择无注入 |
| 读取 `~/.codex` 对话库或真实 thread SQLite | 红线 |
| 修改 ChatGPT.app / 伪造 Codex.app 别名 | 红线 |
| 把预览逻辑写死在 HTML 里 | 必须复用 core / plugin 接口 |

## 预览架构

```
┌──────────────────────────────────────────────────────────────┐
│ tools/panel-preview.html  +  dist/preview/preview.js         │
│ 仅 localhost 或 file:// 打开，不打开 ChatGPT/Codex Desktop     │
├────────────────────────────┬─────────────────────────────────┤
│ 伪 Codex 对话区            │ 右侧 Codex Navigator            │
│ .app-shell-main-content-   │ packages/plugin 面板工厂        │
│   viewport                 │ 只列 User Prompt                │
│ data-turn-id / data-item-id│ 点击 → adapter.jumpToPrompt     │
│ data-role=user             │ IO 高亮当前 Turn                │
└────────────────────────────┴─────────────────────────────────┘
         │                              │
         ▼                              ▼
  CodexCurrentAdapter            PreviewStorage (localStorage)
  （与 Desktop 同一接口）         键前缀 preview，不存正文
         │
         ▼
  restoreReadingPosition()       keymap matchShortcut()
  （纯函数，Node 单测）
```

- fixture 固定：`thread_preview_nav_001` + `turn_u_001`… 每次打开同一份数据。
- 预览把 fixture 渲成带官方候选 selector 的 DOM，再交给 `DomAdapter`，**不在 HTML 里手写跳转列表**。
- 浏览器预览不用 `node:sqlite`。Node 侧 SQLite schema 仍在，供以后 Desktop 用。

## 数据流

```
fixture (Thread/Turn/Item ID + 正文仅在内存)
    → 渲染对话 DOM（正文不进 storage）
    → adapter.listUserPrompts()
         标题 = truncatePromptTitle(30–50)
         contentHash / blockHash 只存哈希
    → 面板 setPrompts(索引行)
    → 点击 / 快捷键 → jumpToPrompt / jumpToLatest
    → scroll idle → 保存 ReadingAnchor（无正文）
    → reload → restoreReadingPosition(saved, candidates) → scroll
```

AppServer 客户端本阶段仍返回 `UNVERIFIED_RPC` / `BRIDGE_MISSING`。预览不假装 AppServer 可用。

## 安全保证

- 不运行 `explodex`，不 `npm i -g explodex`，不 CDP。
- 不读、不写用户 `~/.codex` 对话库。
- 预览 storage 键必须带 `codex-navigator-preview:`，只含 id / hash / offset / 短标题。
- static server **只绑 `127.0.0.1`**，不对外。
- 验收后跑 `scripts/verify-codex-untouched.sh`，对照 `backups/20260912-1713/machine/ChatGPT-sha256.txt`。
- 预览页顶部标明「这不是 Codex」。

## 验收标准

- [x] 预览 fixture 90 条 User Prompt，标题截断到 30–50 字，storage 只存索引（`preview-contract` + PreviewIndexStorage）
- [x] 点击走 `adapter.jumpToPrompt`（`data-turn-id`）
- [x] IntersectionObserver + 滚动高亮（预览 `main.ts`）
- [x] 滚动 idle 保存锚点；刷新调用 `restoreReadingPosition` 三级 fallback
- [x] Jump Latest → `turn_u_090`
- [x] 页内快捷键绑定可见；`parseShortcut` / `matchPreviewShortcut` 单测
- [x] ⌥⌘B 写入 preview 书签索引并出现在 Bookmarks 列表
- [x] ⌘⇧N / Esc 开关面板
- [x] 单测：标题截断、锚点 fallback、快捷键、90 条契约
- [x] `verify-codex-untouched.sh` 通过
- [x] 未打开真实 ChatGPT / Codex Desktop
- [x] 浏览器端到端：`npm run e2e:preview`（Playwright + 本机 Chrome，点/按真实控件）。Cursor 浏览 MCP 无法保持标签页。

## 何时才接 Desktop

同时满足再谈注入：

1. 用户明确说可以注入，且当前没有正在使用的 Codex 长会话；
2. 已决定如何对待「没有 `/Applications/Codex.app`、实际是 ChatGPT.app」；
3. 准备好立刻 Safe Mode（直接开 ChatGPT.app、关掉 Explodex）；
4. 本预览的 Prompt 跳转 / 锚点 fallback / 快捷键单测保持绿色。

在此之前，开发只走 `npm run preview` / `tools/panel-preview.html`。
