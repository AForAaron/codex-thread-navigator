# Compatibility

记录本机探测结果。完整 JSON：[`../compatibility.json`](../compatibility.json)。

| 组件 | 版本 / 状态 | 备注 |
| --- | --- | --- |
| Codex.app (`/Applications`) | 缺失 | Explodex 文档假设的路径 |
| ChatGPT.app | 26.908.40834 (8881) | 实际 Codex Desktop；id `com.openai.codex` |
| Electron asar | 存在 | 未解包 |
| Homebrew Codex CLI | cask 0.145.0 安装物 / brew info 0.154.0 | 终端 agent，不是 UI |
| Explodex npm | 0.2.2 pin | 未全局安装、未运行 |
| Explodex GitHub main | `ab0aeab` (2026-06-29) | SDK docs 称 `Explodex.version` 1.2.0 |
| Explodex refactor 分支 | `codex/refactor-v1-cutover` | 不用 |
| Node | v26.5.0 | `node:sqlite` 可用 |
| Navigator schema | 0.1.0 | 无正文列 |

Selector 包 `codex-current` 对照 Explodex 文档里的 v26.623.31921，**尚未**在 26.908 上验证。
