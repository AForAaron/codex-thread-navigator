# 风险与失效模式

## 已接受的风险

### 1. Explodex 通过 CDP 注入 renderer

Explodex **声明**不修改 `/Applications/Codex.app`：用 LaunchServices 启动未改动的可执行文件，打开 remote debugging port（默认 9333），再注入 SDK。这仍会：

- 让 Codex 以调试模式运行（额外攻击面）
- 在 renderer 里挂全局 `Function.prototype.call/apply` 捕获 AppServer（见 Explodex `sdk-fragility.md`）
- 任何插件 bug 都可能破坏 sidebar / composer

**对策：** 本轮不运行 `explodex`、不创建 launcher、不注入。Phase 0 插件默认 inert。

### 2. Codex Desktop 路径漂移

Explodex 写死 `/Applications/Codex.app`。本机实际是 `/Applications/ChatGPT.app`，bundle id 同为 `com.openai.codex`，版本 `26.908.40834`。强行 `ln -s` 到 Codex.app 会污染 `/Applications`，本项目不做。

失效：即使用户全局安装 explodex@0.2.2，launcher 也会报 Codex 未安装。

### 3. Selector / zone 随版本失效

文档对照 v26.623.31921。本机 26.908。用户消息节点的 `data-testid` **未验证**。错误 selector 的结果是空列表或跳转失败，不应误伤 composer。

**对策：** `verifiedOn: null`；扫描不到节点时返回 `SELECTOR_UNVERIFIED`，不填假数据。

### 4. 没有右侧 zone

用 `statusOverlay`（`body` + `fixed`）做右侧面板会盖住 Codex UI。默认关闭。若开启后挡操作：关开关或 Safe Mode。

### 5. AppServer 误调用

向 live 会话发送未文档化 RPC 可能改 thread 设置或开新 turn。

**对策：** `sendDocumented` 白名单；`listUserTurns` 对 AppServer 恒为 `UNVERIFIED_RPC`。

### 6. 误读对话库

`~/.codex/thread_history_1.sqlite`、`state_5.sqlite`、`Application Support/Codex/Cookies` 都不是 Navigator 数据源。

**对策：** 只写 `~/Library/Application Support/CodexNavigator/`。schema 禁止正文列。

### 7. Explodex npm 与 GitHub 不同步

npm 最新仍是 `0.2.2`（2026-06-29）。GitHub `main` 同日 `ab0aeab`。另有分支 `codex/refactor-v1-cutover`，CI 里 `@explodex/sdk` 解析失败。不要拿它当稳定 API。

## 失效模式 → 回到原生

| 现象 | 做什么 |
| --- | --- |
| Composer / 发送坏了 | 立即退出 Explodex 相关进程，打开 ChatGPT.app |
| 右侧面板挡住 UI | Explodex 设置关掉 Codex Navigator，或删 `~/.explodex/plugins/codex-navigator` |
| Codex 打不开 | 确认没有改 ChatGPT.app；`codesign -dv /Applications/ChatGPT.app` |
| 误以为对话丢了 | Navigator SQLite 不含正文；对话仍在 Codex 自己的库里 |

逐步回退见 [SAFE_MODE.md](./SAFE_MODE.md)。

## 本轮明确没做的危险动作

- 未解包 `app.asar`
- 未对 ChatGPT.app / Codex.app 写入
- 未安装或运行 Explodex launcher
- 未对正在使用的会话做 CDP inject
- 未复制 Cookies / auth.json / keychain
