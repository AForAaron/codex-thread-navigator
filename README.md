# Codex Navigator

> **EN:** A local, read-only navigation & archive layer for long Codex Desktop (ChatGPT.app) threads — prompt index, outline, bookmarks, reading position and search, stored as anchors (ids / hashes / short titles) in a local SQLite. The official app is never modified or injected; jumping inside the official window stays a gated, opt-in future step and is disabled today. MIT licensed. Unofficial, no affiliation with OpenAI or Explodex.

Codex Desktop **长对话导航增强**。不是主题、不是 launcher、不是 AI assistant。

标准体验（后续 Phase）：右侧可折叠 Navigator — Prompt 导航 / Outline / Bookmark / 阅读位置 / Viewport lock / Search / Jump Latest。

落地标准：真实 Thread/Turn 锚点、阅读恢复、书签。本机索引页读 `~/.codex/thread_history_*.sqlite` 的 id，写入 `navigator.sqlite`。官方 ChatGPT 窗口里点目录**还不会滚动**（未注入 Explodex）。假对话预览只留给开发：`/tools/panel-preview.html`。

预览采用 Codex 相邻的系统字体与灰阶界面。目录条依据本机原生组件的静态证据独立复刻：逐条横线、悬停相邻展开、预览和点击定位；阅读控制与搜索在独立预览内验证。实现及真实窗口接入边界见 [docs/NATIVE_NAVIGATION_IMPLEMENTATION.md](docs/NATIVE_NAVIGATION_IMPLEMENTATION.md)。

## 红线

- **不修改、不解包、不 patch、不重签名** `/Applications/Codex.app` 或本机实际的 Codex Desktop 包 `/Applications/ChatGPT.app`
- **不触摸** ChatGPT / Codex 登录仓库、keychain、session cookie、auth token
- **不改写** Codex 对话正文数据库。Navigator 只存 thread/turn/item id、hash、offset、title
- **不写死** 密钥
- 若 Explodex 注入会影响 Codex 正常功能：**立刻停用**，直接打开 ChatGPT.app

## 本机事实（2026-09-12 探测）

| 项 | 值 |
| --- | --- |
| `/Applications/Codex.app` | **不存在** |
| Codex Desktop 实际路径 | `/Applications/ChatGPT.app` |
| Bundle ID | `com.openai.codex` |
| 版本 | `26.908.40834` (build `8881`) |
| Explodex | **未安装**（无 CLI、无 `Explodex.app`、无 `~/.explodex`） |
| Explodex 官方仓库 | https://github.com/dan-dr/explodex |
| 钉住的 npm | `explodex@0.2.2` |
| Homebrew `Codex` | 终端 CLI（cask `codex`），**不是** Desktop UI |

Explodex 文档要求 `/Applications/Codex.app`。本机 OpenAI 已把同一 Electron 包装成 ChatGPT.app。本项目 **不会** 在 `/Applications` 下创建 Codex.app 别名。

## 安装（开发）

```sh
cd /path/to/Codex_UI
npm install
npm test
npm run init-data-dir   # 创建 ~/Library/Application Support/CodexNavigator/navigator.sqlite
```

可选：把插件文件拷到 Explodex 用户目录（**仍不启动、不注入**）：

```sh
npm run build
bash scripts/install-plugin.sh
```

**不要**全局安装或运行 Explodex（用户已选择无注入）。独立预览（不碰 Codex）：

```sh
npm run land             # 手动、短时只读 ~/.codex 对话库，写入 navigator.sqlite 后退出
npm run preview          # 127.0.0.1：只读 navigator.sqlite，不再打开 ~/.codex
```

## 日常使用（三步）

1. `npm run land` —— 短时只读扫描 `~/.codex/thread_history_*.sqlite`，把最近一个合格 thread 的锚点写入 `navigator.sqlite` 后退出。**索引是快照**：有新对话后重跑（`npm run land:all` 可索引全部 thread）。
2. `npm run preview` —— 启动仅绑 127.0.0.1 的服务（Ctrl+C 停止）。
3. 打开 `http://127.0.0.1:8765/tools/desktop-index.html` 管理**真实索引**（浏览 / 标题搜索 / 书签 / 阅读位置 / 复制定位辅助）；或 `/tools/panel-preview.html` 看全功能预览（fixture 假数据）。

注意：官方 ChatGPT 窗口内点目录**不会跳转**（注入未接，by design）。用索引页的「复制标题」到官方窗口 ⌘F 定位，或「复制路由」留存 thread 地址。

## 禁用 / Safe Mode

见 [docs/SAFE_MODE.md](docs/SAFE_MODE.md)。最短路径：

1. 不要运行 `explodex`，不要打开 `Explodex.app`
2. 直接打开 `/Applications/ChatGPT.app`
3. 若已安装用户插件：删掉 `~/.explodex/plugins/codex-navigator`

## 验证本体没被改

```sh
bash scripts/verify-codex-untouched.sh
```

## 目录

```
packages/core/          adapter / 锚点 / Follow / Outline / Search / Bookmarks / SQLite
packages/preview/       独立预览（多 thread fixture + 假对话区）
packages/plugin/        面板 UI + Explodex 入口（默认不注入；lock 默认 no-op）
vendor/explodex-sdk/    官方 d.ts 快照
docs/                   架构 / PHASE2_PLAN / PHASE3_TO_9_PLAN / Safe Mode
backups/                读取备份
```

## 许可证与关系

MIT，见 [LICENSE](./LICENSE)。
与 OpenAI / Explodex 均无官方关系。Explodex：[dan-dr/explodex](https://github.com/dan-dr/explodex)。
