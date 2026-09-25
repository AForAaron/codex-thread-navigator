# Safe Mode：回到原生 Codex Desktop

本机 Codex Desktop 是 **ChatGPT.app**，不是 Codex.app。

## 立刻恢复（推荐）

1. 不要运行 `explodex`，不要打开 `Explodex.app` 或 `~/Applications/Explodex.app`
2. 若 Codex/ChatGPT 是被 Explodex 拉起的：先退出该窗口
3. 用 Launchpad / Spotlight / 下列命令直接打开官方应用：

```sh
open -a /Applications/ChatGPT.app
```

不要附加 `--remote-debugging-port`。

## 禁用 Navigator 插件（若已拷到 ~/.explodex）

```sh
rm -rf ~/.explodex/plugins/codex-navigator
```

或在 Explodex 侧栏 **💥 Explodex** 设置里 Disable `Codex Navigator`。

## 卸载 Explodex 运行时（本轮尚未安装）

若以后装了：

```sh
explodex uninstall-launcher
# 若曾 --system：
# explodex uninstall-launcher --system
npm uninstall -g explodex
rm -rf ~/.explodex
```

官方说明：launcher 不改 Codex bundle id、不重签名 Codex。卸载 launcher 后，继续用 ChatGPT.app。

## 预览与真实 Codex 隔离

- Follow / Mutation 补偿只作用于预览假对话区。真实 adapter 的 lock API 默认 no-op。
- 预览可切换多个 fixture thread；都不是你的真实对话。

- 预览只服务 `127.0.0.1`（`npm run preview`），或打开仓库内 `tools/panel-preview.html`。
- 预览数据是固定 fixture（`thread_preview_nav_001` / `thread_preview_outline_001` / `thread_preview_orphan_001`），**不是**你的真实对话。
- 预览 localStorage 键带 `codex-navigator-preview:`，只存锚点/书签索引。清预览数据：在该页 DevTools 里删这些键，或用浏览器对该源「清除站点数据」。
- 开发预览时 **不要** 打开 ChatGPT.app / Codex Desktop 来测 Navigator。
- 验证本体：`bash scripts/verify-codex-untouched.sh`

## 不要做

- 不要为了「兼容 Explodex」在 `/Applications/Codex.app` 做符号链接
- 不要重签名 / 解包 ChatGPT.app
- 不要删 `~/Library/Application Support/Codex`（那是 Electron userData，含登录态）
- 不要删 `~/.codex` 来「修复」Navigator；Navigator 数据只在 `~/Library/Application Support/CodexNavigator/`

## 确认本体完好

```sh
bash scripts/verify-codex-untouched.sh
codesign -dv /Applications/ChatGPT.app
```

期望：`Identifier=com.openai.codex`，`TeamIdentifier=2DC432GLL2`（OpenAI OpCo, LLC）。
