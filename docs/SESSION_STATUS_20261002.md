# Codex Navigator：完整现状报告（2026-10-02）

> 用途：交给其他 AI / 开发者分析。覆盖 2026-09-24 至 2026-10-02 的全部工作、当前运行状态、已验证结论、已知问题和待决策事项。
> 标注规则：**[已确认]** 有实测或日志证据；**[高可能]** 证据较强但缺最后验证；**[未确认]** 尚无证据。
> 路径中的用户主目录一律写作 `~`。

> **15:00 之后的更新（以本段为准，正文中与之冲突的描述已过时）**
> - **方案 C1 已实施并验证**：新增 `tools/provider-switcher/catalog.py`。切到 Go 时生成只含 `gpt-6-luna`、`gpt-5.6-luna` 的目录，并写入 `model_catalog_json`；生成后先用临时 `CODEX_HOME` 的 Codex 后端校验一次再写入。实测结果：后端 `model/list` 只返回这两个模型，decode 报错为 0；桌面端模型按钮也只显示这两个（用户确认，#19694 的过滤问题未出现）。
> - **修复：原生按钮的改动阻止恢复原生**。Codex 会把原生按钮选择的 `model` / `model_reasoning_effort` 写回 `config.toml`，原来的保护逻辑会把这当成"外部篡改"，导致无法恢复（用真实配置副本已复现）。现在允许 `model` 在已验证的 Go 模型之间变化、允许推理强度任意变化；其他字段（如 `model_provider`、`model_catalog_json`）被改仍然拒绝。新增 2 项测试，切换器测试共 20 项。
> - **"偶发失败"真相**：`test_wrong_host_is_blocked` 在有 `http_proxy` 的环境里，请求被代理接走，返回 502。测试客户端已改为绕过代理，在沙箱内外各跑 3 次均全部通过。
> - **Keychain 账户名不再写死**：改为当前 macOS 用户（可用 `CODEX_PROVIDER_KEYCHAIN_ACCOUNT` 覆盖）。本机生成的 provider 配置与现有配置完全一致。
> - 注意：正在运行的 `bridge.py` 加载的是修复前的代码。**要先 ⌘Q 退出，再从 Codex Navigator 重新打开，然后才能在面板里恢复原生**，否则仍会报"外部修改"。

---

## 0. 一页摘要

- **项目是什么**：给 Codex 桌面版（实际安装为 `/Applications/ChatGPT.app`，Bundle ID `com.openai.codex`，当前版本 26.928.31416）补"长对话导航"和"额度/模型来源"相关的界面能力。
- **现在能用的**（从 `~/Applications/Codex Navigator.app` 启动时）：
  1. 左侧 52px 窄栏、头像上方常驻显示 Codex 额度（5h / 周 / 重置次数）。[已确认]
  2. 额度上方的 ⇄ 按钮，打开"模型来源"面板：在 Codex/OpenAI 与 OpenCode Go 之间切换、查看 Go 用量、保存配置。[已确认]
  3. 面板内"重启 Codex 以应用"：两步确认后 Codex 正常退出，并自动通过 Navigator 重新打开、重新加载全部功能。[已确认]
- **现在不能用的**：普通 Chat 的目录刻度条和阅读位置恢复。Codex 自动更新改了页面结构，插件按设计在结构不匹配时不显示。[高可能]
- **已证实的冲突**：Codex 输入框里原生的模型按钮只能换"模型名"，不能换"服务"（服务在对话创建时固定）。在 Go 对话里选了 OpenAI 独有的模型，例如 6.1 Sol，请求仍会发给 OpenCode Go，并返回 400 / `Model is unavailable`。[已确认]
- **待决策**：是否实施"方案 C1"，即用 Codex 官方配置 `model_catalog_json` 在 Go 模式下只向原生按钮提供两个 Luna 模型。后端已验证可行，桌面端尚未验证。

---

## 1. 项目背景与红线

### 1.1 原始定位（仓库 README / docs）

- 只读锚点：对话正文永远留在 Codex 自己的库里。Navigator 只存 thread/turn/item id、哈希和短标题。
- 不修改、不解包、不重签名 ChatGPT.app。不碰登录凭证、Keychain 内容和 Cookie。不写 Codex 的对话数据库。
- 一切失效都可以回退：直接用普通方式打开 ChatGPT.app 即可（Safe Mode，见 `docs/SAFE_MODE.md`）。

### 1.2 演变

- 最初的设计是"无注入"。只有本机索引页（`tools/desktop-index.html`）和假数据预览页（`tools/panel-preview.html`）。
- 2026-09-27 到 10-01，另一个并行会话（下称"平行会话"）推进了真实窗口接入，选择了非官方的 **Explodex 渲染层注入**（CDP 调试端口 + 注入脚本），并实现了额度栏、Chat 目录、模型来源切换器。
- 10-02，本会话在此基础上完成了"启动图标 + 自动重启"，并排查了卡死问题。

### 1.3 当前与红线的关系

- 应用包仍未被修改。`scripts/verify-codex-untouched.sh` 以 `codesign --verify --strict` 和身份断言为准。[已确认，10-02 多次通过]
- 但通过 Navigator 启动时，Codex 整个运行期间都开着本机调试端口（随机端口）。这是新增的风险面，详见第 7 节。

---

## 2. 时间线

| 日期 | 事件 | 结果 |
|---|---|---|
| 09-24 | 全面审查（两轮 + 三轮深审） | 红线全部守住。发现 14 个问题，推翻了子 agent 的 3 条误判 |
| 09-24 | 修复 ①–⑥ | ① 畸形 `%` 路径导致预览服务崩溃 → 返回 400；② SQLite 并发写 `database is locked` → `busy_timeout=500`；③ 新增 `tsconfig.web.json`，为 plugin/preview 补类型检查（当场查出 4 处错误的 import 路径）；④ verify 脚本改为断言式检查；⑤ e2e 失败时泄漏服务进程；⑥ 旧库迁移缺少 `item_id` 列 / `schema.sql` 依赖当前目录 |
| 09-24 | `git init` + 首次提交 | — |
| 09-25 | 推送到 GitHub `<owner>/codex-thread-navigator`（public） | 发现提交元数据里有真名和个人邮箱 → 改写唯一提交为 noreply 身份并强推；3 处文件脱敏；新增隐私哨兵 `scripts/check-privacy.sh` + pre-push hook |
| 09-27 | Track A：MIT LICENSE、README 英文摘要和日常使用 | 已提交 |
| 09-27 | Track B（`land:all`、索引页搜索/新鲜度/复制辅助、e2e 隔离库） | 代码已写，部分被平行会话的改动覆盖或合并，**未单独提交**（见第 9 节） |
| 09-27 → 10-01 | 平行会话：G0 验证、Iframe Probe 插件、额度栏、Chat 目录、模型来源切换器 | 提交到 `1dd30b9`，其余改动未提交 |
| 10-02 上午 | Codex 打开即卡死，排查 | 根因是一个特定线程（见第 6 节），与插件无关 |
| 10-02 中午 | A1：`Codex Navigator.app` 启动图标 | 已实现并实测 |
| 10-02 下午 | 自动重启、修复 Explodex 入口挤占、OpenCode Go 实测、原生按钮冲突实测、方案 C 调研 | 见第 4–8 节 |

---

## 3. 当前系统组成

### 3.1 组件总览

| 组件 | 位置 | 作用 | 何时运行 |
|---|---|---|---|
| 启动图标 | `~/Applications/Codex Navigator.app`（osacompile 生成，ad-hoc 签名，图标取自 ChatGPT.app） | 后台调用 `scripts/launch-usage-rail.sh --background` | 用户双击 |
| 启动脚本（兼守护） | `scripts/launch-usage-rail.sh` | 检查 → 随机端口启动 Codex → 注入 → 会话结束后检查重启标记 | Codex 运行期间常驻 |
| 注入会话 | `scripts/inject-usage-rail.mjs` | 通过 CDP 注入 Explodex SDK 和插件，每 60 秒读一次 Codex 额度并推送给页面，拉起切换器会话 | Codex 运行期间常驻 |
| 切换器会话 | `scripts/provider-rail-session.mjs` | 在页面注入 ⇄ 按钮和面板（Shadow DOM），通过 CDP binding `__cnProviderRequest` 与 `tools/provider-switcher/bridge.py` 通信，处理 `status/usage/apply/restart` | 由注入会话拉起 |
| Navigator 插件 | 源码 `packages/plugin/`，安装位置 `~/.explodex/plugins/codex-navigator/` | 额度栏（`.cn-usage`）、Chat 目录与阅读锚点 | 注入后在页面内运行 |
| 模型来源配置逻辑 | `tools/provider-switcher/`（`configuration.py`、`bridge.py`、`control.py`、`ui.js` 等） | 读写 `~/.codex/config.toml` 中与模型来源相关的字段，读取 Go 用量（密钥由 Keychain `apikey/opencode-go` 提供） | bridge 由切换器会话拉起；`control.py` 是独立网页版（8766），目前**未运行** |
| Iframe Probe 插件 | `plugins/navigator-iframe-probe/`，通过 `.agents/plugins/marketplace.json` 注册为 Codex 本地插件市场 `codex-ui-local` | Codex 官方插件机制下的 MCP 插件，只能在对话里输出卡片（位置探针、已知线程目录、搜索） | 依赖本地服务 `127.0.0.1:8879`（`server.mjs`） |

### 3.2 两套"插件"的区别（经常被混淆）

| | Codex Navigator（注入式） | Navigator Iframe Probe（官方插件式） |
|---|---|---|
| 机制 | Explodex + CDP 调试端口，直接改 Codex 页面 | Codex 官方插件 + MCP Apps，只能在对话里显示 iframe 卡片 |
| 能否改左侧栏/对话区 | 能 | 不能 |
| 提供 | 额度栏、Chat 目录、模型来源面板 | 位置探针、给定线程 ID 的目录/搜索卡片 |
| 开关 | 是否从 `Codex Navigator.app` 启动 | Codex 插件设置页，或 `config.toml` 中的 `enabled` |

官方插件机制无法实现常驻左侧栏等原生界面改动。依据是平行会话 09-28 的实测（`docs/OPENAI_HOST_EXTENSION_INQUIRY.md`）和 OpenAI 插件 UI 文档。

### 3.3 启动流程（`launch-usage-rail.sh`）

1. 后台模式下，输出写入 `~/Library/Logs/CodexNavigator/launcher.log`，出错弹 macOS 警告框。
2. 选一个 20000–60000 之间的随机空闲端口（可用 `EXPLODEX_DEBUG_PORT` 指定）。
3. 依次检查：插件文件、本地 Explodex 运行时、node、`codesign --verify --strict`。
4. 如果 Codex 已经在运行：
   - 带调试端口（说明是 Navigator 启动的）→ 只把它切到前台，然后退出。
   - 普通模式 → 弹提示"请先 ⌘Q 退出 Codex"，**不会强制关闭**。
5. `open -a ChatGPT.app --args --remote-debugging-port=<随机端口>`，确认端口确实属于 ChatGPT.app。
6. 运行 `inject-usage-rail.mjs`：
   - 最多等 30 秒，直到主页面 `app://-/index.html` 出现（修复了"注入太早"）。
   - 注入 SDK 和插件，并注入隐藏 Explodex 外壳入口的样式（见第 5.3 节）。
   - 拉起 `provider-rail-session.mjs`。
   - 每 60 秒刷新一次额度。Codex 退出、调试连接断开时**立即**结束（不再等 60 秒）。
7. 会话结束后，检查重启标记（见 3.4）。

### 3.4 自动重启流程

1. 面板里点"重启 Codex 以应用"，再在 5 秒内点一次确认。
2. `provider-rail-session.mjs` 写入 `~/Library/Application Support/CodexNavigator/restart-requested`（内容为毫秒时间戳），然后执行 `osascript -e 'tell application id "com.openai.codex" to quit'`，等同于 ⌘Q。
3. Codex 退出 → 注入会话结束 → 启动脚本发现标记：
   - 2 分钟内的有效标记 → **先删除标记** → 最多等 60 秒让 Codex 完全退出 → `exec` 自身，重新走一遍完整启动。
   - 过期标记 → 忽略。
   - 60 秒内 Codex 没退出 → 取消自动重启，并弹提示。
4. 不带标记的退出（用户自己 ⌘Q）→ 正常结束，不会重开。

---

## 4. 已验证事项（带证据）

| 事项 | 证据 | 状态 |
|---|---|---|
| 自动化测试 | `npm test` 78 项 + `usage-placement` 2 项 + 切换器 Python 12 项，共 92 项通过 | [已确认] |
| 启动图标一次成功 | 14:12:12 启动，端口 29625，插件和切换按钮自动加载 | [已确认] |
| 注入时序修复 | 修复前 13:47 报 `Codex renderer target not found`；修复后多次一次成功 | [已确认] |
| 额度栏显示 | CDP 读取：`.cn-usage` 可见，位置 x=8 y=753 36×92，内容如 `5h 62% / 周 17% / 重置 1 次`；用户截图确认 | [已确认] |
| Explodex 入口隐藏 | 隐藏后窄栏从 115px 恢复为 52px，额度和按钮重新出现；重启后自动生效（`cn-hide-explodex-shell` 存在） | [已确认] |
| 自动重启 | 日志：14:17:57 会话结束 → 发现重启请求 → 14:17:58 新端口 22975 重新启动 → 插件和按钮加载；标记文件已删除 | [已确认] |
| 切到 OpenCode Go | `config.toml`：`model_provider = "opencode-go"`、`model = "gpt-6-luna"` | [已确认] |
| Go 实际路由 | Codex 请求日志 `~/.codex/logs_2.sqlite`：新对话"查询当前模型"发出 4 次 `POST https://opencode.ai/zen/go/v1/responses`，全部 200，工具调用（列目录）成功 | [已确认] |
| 旧对话保持原服务 | 线程表 `~/.codex/state_5.sqlite`："测试对话"（09-28 创建）仍为 `openai / gpt-6.1-sol` | [已确认] |
| 原生按钮冲突 | 在 Go 对话里选 6.1 Sol → `POST .../zen/go/v1/responses` 返回 **400**，界面 `Upstream request failed: Model is unavailable.`；线程被记为 `opencode-go / gpt-6.1-sol` | [已确认] |
| 应用签名完好 | `codesign --verify --strict` 通过，TeamIdentifier `2DC432GLL2` | [已确认] |

---

## 5. 本会话今天修复的问题

### 5.1 启动脚本在 `pipefail` 下静默退出

`ps | awk '{...; exit}'` 中，awk 提前退出会导致 ps 收到 SIGPIPE，`set -o pipefail` 把整条命令判为失败，脚本在没有任何提示的情况下退出。`lsof | head -n 1` 也有同样问题。已改为不提前退出的 awk 写法，并做了隔离验证。

### 5.2 注入太早

调试端口就绪时，主页面还没有创建，脚本只查一次就失败了。现在会每 0.5 秒查一次，最多查 60 次（30 秒）。

### 5.3 Explodex 外壳入口挤掉额度栏

Explodex SDK 的内置插件 `explodex-shell`（`dynamicUnloadable: false`，无法卸载）会在左侧窄栏底部加一个"✷ Explodex"按钮（`[data-explodex-nav="explodex-shell"]`，位于 `[data-explodex-footer-plugins]` 内），把窄栏撑到 115px。额度组件的定位逻辑（`packages/plugin/src/ui/usage-placement.ts`）判定结构不匹配，于是隐藏了自己；⇄ 按钮跟随额度组件定位，也一起隐藏。现在注入时会加样式把这两个元素设为 `display:none`。用户点开它会看到 Explodex 自带的插件管理页（`app://-/explodex`），这个页面无害但没有用处。

---

## 6. 10-02 卡死事件（已结案）

- **现象**：Codex 打开后完全无法操作。
- **证据**：主窗口渲染进程 CPU 99–100%；采样显示主线程卡在 JIT 编译后的 JS 循环里；三次卡死前的最后动作都是打开同一个线程 `01a0f802…`（标题"Codex接入OpencodeGo 按照这个设计为我设计一下在codex上的实现；"）。
- **触发点**：该线程里有一条状态为 `failed` 的 `codex_app / open_in_codex`（打开文件）调用。全库 9 条同类调用中，只有这一条是失败的。Codex 前端渲染这张卡片时进入死循环。[高可能]
- **为什么"点哪个线程都卡"**：每次卡死前，日志都有 `IAB_LIFECYCLE received browser sidebar owner sync conversationId=client-new-thread:a0748990… ownerRoutePath=/local/01a0f802…`，即内置浏览器侧栏的残留状态会把导航带到这个线程。[高可能]
- **排除插件的依据**：第二次卡死时 Iframe Probe 处于关闭状态；三次卡死时都是普通启动，日志里注入痕迹为 0。[已确认]
- **处理**：用户已归档并删除该线程，之后没有再卡死。
- **备注**：期间曾两次修改 `~/.codex/config.toml` 中 Iframe Probe 的 `enabled`（先关后开），最终状态是启用。两份备份见第 8 节。

---

## 7. 已知问题、限制与风险

### 7.1 普通 Chat 目录 / 阅读位置失效 [高可能]

- Chat 目录（`packages/plugin/src/chat-session.ts`）是在 Codex 26.928.21956 上验证的，现在的版本是 26.928.31416。
- 它要求可见的对话区（`.thread-scroll-container`，宽 ≥300、高 ≥200）内有 `[data-map-composer-conversation]` 来取得会话 ID，并且需要 `[data-turn-key]` 加 `[data-user-message-bubble]`，同时至少 4 轮。
- 现状：可见对话区里**没有**会话 ID 属性。轮次 key 出现 `fallback-turn-0`、`history-cont…` 等新格式，还新增了 `data-content-search-turn-key`、`data-chatgpt-agent-turn-start`。带旧结构的两个对话区都是隐藏的（0×0）。
- 插件按设计"结构不匹配不猜测"，所以不显示。阅读位置恢复用的是同一套识别逻辑，[高可能] 也失效了。
- [未确认] 这种结构是更新后所有 Chat 都这样，还是只有某类对话（例如 Agent 对话）如此。

### 7.2 原生模型按钮与服务切换冲突 [已确认]

- Codex 按对话固定服务（线程表 `model_provider` 字段）。原生按钮只改模型名。
- Go 模式下，Codex 请求 `GET https://opencode.ai/zen/go/v1/models` 返回 200，但报 `failed to decode models response: missing field 'models'`：Go 返回的是 OpenAI 风格的 `{"object":"list","data":[...]}`，而 Codex 需要 `{"models":[...]}`。所以按钮里显示的仍是 OpenAI 的缓存目录（`~/.codex/models_cache.json`，10 个模型）。
- OpenAI 目录里的 `gpt-6-luna`、`gpt-5.6-luna` 与 Go 的模型**同名**，所以这两个在 Go 对话里能用。其余（6.1 Sol、6 Astra、6 Sol、5.6 Sol、5.6 Terra、5.5）在 Go 对话里选择会得到 400。
- 已经被选错的对话会一直报错，在原生按钮里切回 6 Luna 即可恢复。
- 当前对策是方案 A，即使用规则：换服务只用 ⇄ 面板，然后新建对话；原生按钮只在同一服务的模型之间切换。

### 7.3 Go 用量"没变化"

已证实请求确实发到了 Go。用量显示为已用百分比，4 次短请求可能还不到显示精度；另外切换器对用量有 60 秒缓存。[高可能]

### 7.4 调试端口常开 [已确认]

从 Navigator 启动时，Codex 整个运行期间都开着本机调试端口（随机端口、只监听本机）。本机任何程序都能通过它控制 Codex 页面，而 Codex 本身能执行命令、修改文件。用普通方式打开 ChatGPT.app 就没有这个风险。

### 7.5 无法拦截 Codex 自更新后的重启 [确认]

Codex 自动更新后自行重启时，会以普通模式打开，三项功能消失。需要 ⌘Q 后从启动图标重新打开。

### 7.6 非官方注入随版本漂移

DOM 结构、Explodex 外壳行为、Codex 的路由都可能变化。7.1 就是一个实例。

### 7.7 其他

- `scripts/provider-rail-session.mjs` 写死了 Python 路径 `~/.pyenv/versions/3.10.12/bin/python3`（可用 `CODEX_PROVIDER_PYTHON` 覆盖）。
- `navigator-iframe-probe/server.mjs` 是一个 3 天多的孤儿进程（父进程 PID 为 1），不会开机自启。Iframe Probe 插件启用而服务没运行时，Codex 会报 MCP 连接失败，但不会卡死。
- 切换器网页版服务 `control.py`（8766）目前没有运行。左侧面板不依赖它。

---

## 8. 本机全局改动清单（项目目录以外）

| 位置 | 内容 | 来源 |
|---|---|---|
| `~/.codex/config.toml` | `model = "gpt-6-luna"`、`model_provider = "opencode-go"`（当前处于 Go 模式）；`[model_providers.opencode-go]`（base_url `https://opencode.ai/zen/go/v1`，auth 通过 `/usr/bin/security find-generic-password -s apikey/opencode-go -w`）；`[marketplaces.codex-ui-local]`（source 指向本仓库）；`[plugins."navigator-iframe-probe@codex-ui-local"] enabled = true` | 平行会话 + 本会话（enabled 开关） |
| `~/.codex/config.toml.bak-before-disable-navigator-20261002-092528`、`…bak-before-reenable-navigator-20261002-123728` | 两次切换 Iframe Probe 开关前的备份 | 本会话 |
| `~/.codex/go-gpt-5-6-luna.config.toml`、`~/.codex/go-gpt-6-luna.config.toml` | CLI 用的 profile | 平行会话 |
| `~/.codex/provider-switcher/` | 切换器的配置备份和恢复记录 | 平行会话 |
| `~/.explodex/plugins/codex-navigator/` | 已安装的插件（与 `dist/plugin` 构建产物一致） | 共同 |
| `~/.explodex/plugins/codex-navigator.bak-20261002-134039` | 重新安装前的备份 | 本会话 |
| `~/Applications/Codex Navigator.app` | 启动图标 | 本会话 |
| `~/Library/Logs/CodexNavigator/launcher.log` | 启动 / 注入 / 重启日志 | 本会话 |
| `~/Library/Application Support/CodexNavigator/` | `navigator.sqlite`（索引）；`restart-requested`（重启标记，用完即删） | 共同 |

---

## 9. 仓库状态

- 远端：`https://github.com/<owner>/codex-thread-navigator`（public，MIT），本地 `main` 与 `origin/main` 同步，最新提交是 `1dd30b9`。
- **未提交的改动**（本会话与平行会话混在一起，提交前需要拆分）：

| 文件 | 修改方 | 内容 |
|---|---|---|
| `scripts/launch-usage-rail.sh` | 本会话 | 后台模式、随机端口、提示框、pipefail 修复、已运行时切到前台、自动重启守护 |
| `scripts/inject-usage-rail.mjs` | 本会话 + 平行会话 | 本会话：断开即停、等待主页面、隐藏 Explodex 入口；平行会话：拉起 `provider-rail-session.mjs` |
| `scripts/provider-rail-session.mjs`（新） | 平行会话 + 本会话 | 平行会话：面板与桥接；本会话：`restart` 操作和重启按钮 |
| `packages/plugin/src/index.ts`、`ui/usage-indicator.ts`、`ui/usage-placement.ts`（新） | 平行会话 | 额度栏定位改为以原生底部区域为锚点 |
| `tools/provider-switcher/`、`tests/provider-switcher/`、`scripts/open-provider-switcher.command`、`scripts/check-go-models.py`、`docs/PROVIDER_SWITCHER_*.md` | 平行会话 | 模型来源切换器 |
| `.gitignore`、`package.json`、`docs/CODEX_USAGE_RAIL_20261001.md` | 平行会话（含本会话的 `land:all`） | — |
| `.impeccable/`、`tmp/*.png`、`tmp/navigation-review/` | 平行会话 | 审查截图（可能不该入库） |
| `docs/SESSION_STATUS_20261002.md`（本文件） | 本会话 | — |

- 注意：提交前要运行 `bash scripts/check-privacy.sh`（pre-push hook 也会运行）。截图和日志可能包含个人路径。

---

## 10. 方案 C 调研结论（让原生按钮在 Go 模式下只列可用模型）

### 10.1 依据

- 官方配置项 `model_catalog_json`："Optional path to a JSON model catalog loaded on startup"，可以由 profile 覆盖，只能在用户级配置中使用（[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)）。
- [issue #19694](https://github.com/openai/codex/issues/19694)：有用户反馈，在桌面端 26.422 上，`model_catalog_json` 里的模型被按钮过滤掉了（后端 `model/list` 正常返回）。该 issue 已关闭，没有维护者回复。
- [issue #29156](https://github.com/openai/codex/issues/29156)：桌面端缺少按服务区分的模型按钮；`ThreadStartParams.modelProvider` 只能在创建对话时指定；`model_catalog_json` 是整体替换而不是追加。该 issue 仍处于开放状态。

### 10.2 后端实测

方法：独立启动与桌面端同版本的 CLI `codex-cli 0.159.2`，执行 `app-server --stdio -c model_provider=… -c model_catalog_json=…` 后调用 `model/list`。目录文件从 `~/.codex/models_cache.json` 中原样复制 `gpt-6-luna`、`gpt-5.6-luna` 两条，格式为 `{"models":[...]}`。

| 服务 | 目录 | `model/list` 结果 | 报错 |
|---|---|---|---|
| opencode-go | 默认 | 6.1 Sol、6 Astra、6 Sol、6 Luna、5.6 Sol、5.6 Terra、5.6 Luna、5.5 | 有 decode 失败 |
| opencode-go | 仅两个 Luna | 6 Luna、5.6 Luna | 无 |
| openai | 仅两个 Luna | 6 Luna、5.6 Luna | 无（OpenAI 其他模型也被隐藏） |

### 10.3 拟实施方案 C1（尚未实施）

1. `tools/provider-switcher/configuration.py`：切到 Go 时，从当时最新的 `models_cache.json` 中提取"已验证的 Go 模型"条目，生成 `~/.codex/provider-switcher/go-models.catalog.json`，并写入 `model_catalog_json`；恢复原生时删除该字段，把它纳入受管理字段并在恢复时精确还原。
2. 补测试：切换与恢复循环中 `model_catalog_json` 的写入和删除；从缓存提取条目；缓存缺失时的降级行为。
3. 桌面端实测：切到 Go 并自动重启后，看原生按钮是否只剩两个 Luna（验证 #19694 是否仍然存在）；切回原生并自动重启后，看按钮是否恢复完整列表。

### 10.4 C1 的风险

- [未确认] 桌面端按钮的过滤行为（#19694）。
- 目录是快照，所以每次切到 Go 都要重新生成。
- 如果恢复时漏删 `model_catalog_json`，原生模式下也只剩两个 Luna。必须用测试覆盖。

---

## 11. 待办

| 优先级 | 事项 | 状态 |
|---|---|---|
| 高 | 决定是否实施 C1 | 等用户决定 |
| 高 | 第 6 步验证：切回原生（自动重启方向）+ ⌘Q 后确认注入会话、切换器会话、调试端口全部清理 | 未做 |
| 中 | Chat 目录按 Codex 26.928.31416 的新结构重新适配（需要在多种 Chat 中取样） | 未做 |
| 中 | 拆分并提交未提交的改动（本会话 / 平行会话），提交前运行隐私哨兵 | 未做 |
| 中 | README 补充：启动图标、自动重启、⇄ 面板、Explodex 入口说明、删除方法 | 未做 |
| 低 | 向 OpenAI 反馈"失败的 open_in_codex 卡片导致前端死循环" | 未做 |
| 低 | 清理 8879 孤儿进程，或者给 Iframe Probe 服务做开机/按需启动 | 未做 |
| 低 | `provider-rail-session.mjs` 的 Python 路径改为自动探测 | 未做 |

---

## 12. 希望分析方重点回答的问题

1. 方案 C1（`model_catalog_json`）与"本机代理转换 `/models` 格式"相比，哪个更稳？在 Codex 26.928 上，#19694 的过滤行为是否仍然存在，有没有办法在不重启桌面端的情况下预判？
2. 7.1 的 Chat 新结构中，有没有稳定的会话 ID 来源（例如路由、`data-content-search-turn-key` 与消息 ID 的关系）可以替代 `data-map-composer-conversation`？`fallback-turn-*`、`history-cont*` 这类 key 应该如何处理？
3. 调试端口常开的风险，有没有更好的缓解办法？例如只在需要时开启，或者使用 `--remote-debugging-pipe` 之类的替代方案。是否值得为此牺牲"常驻"体验？
4. 自动重启的守护设计（标记文件 + `exec` 自身）是否存在竞态或死循环风险？例如重启过程中用户手动打开了 ChatGPT.app，或 Codex 弹出退出确认框。
5. 未提交改动的拆分方案，以及 `.impeccable/`、`tmp/` 等目录是否应该加入 `.gitignore`。
