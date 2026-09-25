# Phase 3–9 计划（无注入预览内做完产品面）

用户选择：**继续完成剩下的内容**，路线仍是独立预览。Desktop / Explodex **本轮不接**。

**本轮状态（2026-09-12）：已在独立预览实现 Phase 3–9。** 预览 URL：`http://127.0.0.1:8765/tools/panel-preview.html`。Desktop adapter 的 `lockViewport` 默认 `DISABLED`。

## 本轮在预览里完成什么

| Phase | 预览交付 | Desktop |
| --- | --- | --- |
| 3 | 多 thread 各自自动恢复阅读位置；设置可关自动恢复 | 不接 |
| 4 | Follow ON/OFF、模拟生成、↓ New content；补偿只绑假对话容器 | 不接 |
| 5 | 当前可见 assistant 的 h1–h4 Outline，点击跳转；20 heading fixture | 不接 |
| 6 | Bookmark：Turn / Message / Heading + Rename + 删除 + 跳转 | 不接 |
| 7 | 对话内搜索、⌘⇧F / Esc、匹配高亮；500 条内存搜索单测 | 不接 |
| 8 | accent / 当前 Turn / 星标 / 高亮；快捷键可改；宽度可拖；主题；方向键 | 不接 |
| 9 | e2e 扩覆盖、Export 索引、orphaned 标记、verify-codex | 不接 |

## 明确仍不接 Desktop

- 不运行 `explodex`，不打开 ChatGPT.app / Codex.app
- Viewport Lock / Mutation 补偿 **只挂在预览** `.app-shell-main-content-viewport`
- `DomAdapter` 上的 lock API 默认 **no-op**（`gate !== "preview"`）
- 不读 `~/.codex` 对话库

## Viewport Lock 为什么只在 preview 启用

真实 Codex 的滚动由它自己的 thread-scroll 布局管理。在 Desktop 里默认拦截滚动或补偿 Mutation，容易把用户正在看的长对话拽走。预览的假对话容器是我们自己渲的，可以安全做 Follow。接 Desktop 必须另开一轮、默认关闭、用户显式打开。

## 每阶段验收标准

### Phase 3

- 至少 2 个 fixture thread；在 A 滚到某 Turn，切到 B，再切回 A，恢复 A 的位置
- 设置关闭「自动恢复」后，刷新不再跳走
- 仍是三级 fallback（Turn+Item+Block → Turn+Item → Turn）

### Phase 4

- 距底部 < 80px → Follow ON；上滚 → Follow OFF
- Follow OFF 时点「模拟 GPT 正在生成」，视口不动，出现 `↓ New content`
- 点 New content / Jump Latest 到底，Follow 回到 ON

### Phase 5

- Outline 线程里一条 assistant 回复含 **20** 个 h1–h4
- 侧栏 OUTLINE 正好 20 个，点击滚到对应 heading
- 无 heading 的回答：Outline 为空，不做 AI 分段

### Phase 6

- 能分别收藏 Turn / Message / Heading，Rename，删除，点击跳回
- ⌥⌘B：有可见 heading 则收藏 heading，否则 message/turn
- 存储键 `codex-navigator-preview:`，无正文

### Phase 7

- 搜一个只出现在已知 Turn 的词，列表点击跳转并短暂高亮
- ⌘⇧F 聚焦；Esc 关掉搜索面板（面板本身仍可用 Esc 关）
- 500 条内存搜索单测 < 100ms

### Phase 8

- User Prompt 左侧 accent；当前 Turn 背景；书签星标；搜索 highlight
- 设置里改一个快捷键立即生效
- 面板可拖宽；浅色/深色可切
- Prompt 列表可 ↑↓ / Enter

### Phase 9

- `npm run e2e:preview` 覆盖 Outline / Search / 三粒度 Bookmark / Follow / 刷新恢复
- Export 只有 anchors / bookmarks / titles / prefs
- 从目录「移除」一个 thread 后，其书签标 orphaned，不删
- `verify-codex-untouched.sh` 通过

## 本轮落地（预览，2026-09-12）

- 预览：`npm run preview` → `http://127.0.0.1:8765/tools/panel-preview.html`
- 验收：`npm test`（36）+ `npm run e2e:preview`（Playwright 真点击）+ `bash scripts/verify-codex-untouched.sh`
- Desktop / Explodex / `~/.codex`：**没接、没读、没改**
