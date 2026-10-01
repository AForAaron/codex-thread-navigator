# 2026-09-28 只读 App Server 与官方插件 iframe 样例

## 已验证的事实

| 目标 | 证据 | 状态 |
| --- | --- | --- |
| 已知 Codex 线程的轮次与消息 ID | 本机 `codex-cli 0.145.0`，`node scripts/appserver-history-client.mjs <known-thread-id>`；`thread/read(includeTurns=true)` 对分页线程返回不支持，客户端改用实验性 `thread/turns/list(itemsView=full)` 直到 `nextCursor=null` | 10 轮、55 条 user/agent 消息；两次读取的轮次 ID 和消息 ID 列表一致；命令只打印计数，不打印正文 |
| 较长线程兼容性 | 对另一已知的约 80 次提问线程使用同一路径 | `thread/turns/list` 报 `subagent-completed` 项的 `completed` variant 无法反序列化；没有取得完整轮次。原因尚未确认，不能宣称对所有历史线程可用 |
| MCP Apps 插件 UI 协议 | `server.test.mjs` 使用官方 SDK 调用工具和读取 UI resource；另用 Streamable HTTP 在本机回环地址完成一次真实协议调用 | 工具 `show_navigator_placement_probe` 可调用，返回 `_meta.ui.resourceUri` 所指 HTML；MIME 为 `text/html;profile=mcp-app`；没有读取会话或改动宿主 |
| Chat 宿主中的实际显示位置 | 需要将 MCP 服务经 HTTPS 接入 Chat 开发模式，并在 Chat 内调用工具 | **未验证** |
| Codex 宿主中的实际显示位置 | 用户提供的 Codex 截图显示“Navigator Iframe Probe”工具结果区域中的“导航插件显示位置验证”卡片，卡片显示 `window.openai 可用` | **工具结果 iframe 显示已验证；不是宿主原生目录条** |
| 已知线程目录 MCP 工具 | 新版 `list_known_thread_directory` 只接受显式线程 ID；运行中 MCP 服务通过 App Server 读取此前的测试线程；用户提供新的 Codex 测试会话截图 | 10 轮、10 个目录条目，UI resource 为 `text/html;profile=mcp-app`；**目录卡片已在真实 Codex 工具结果区域显示**，卡片内可见标题列表与筛选框 |
| 已知线程全文搜索 MCP 工具 | `search_known_thread` 对显式线程 ID 使用同一个只读 App Server 客户端，并在进程内检索所有已取得的提问和回答；单测覆盖回答专属词、多处命中、ID、偏移与截断 | 本机运行中服务对上述 10 轮测试线程完成一次真实协议调用，返回完整读取、3 处命中；仅打印计数，未打印正文。**尚未在新 Codex 任务里验证搜索卡片实际显示**；不会自动识别当前线程或滚动宿主对话 |

本机验证仅覆盖一个已知线程的完整分页读取和同一时间内两次 ID 一致性；不证明活动线程读取具有原子快照语义、Chat 历史能由 Codex App Server 读取，或 ID 永久不变。`agentMessage.text` 与 `userMessage.content` 字段被检查为已加载；多模态内容不被转换为可搜索文字。客户端只发 `initialize`、`thread/read` 和 `thread/turns/list`，不会调用写入 RPC；正文只在进程内存中存在。

## 文件与复测

- `scripts/appserver-history-client.mjs`：只读 App Server 客户端；命令格式 `npm run history:read -- <已知线程 ID>`。需要当前用户可读的本机 Codex 历史。
- `plugins/navigator-iframe-probe/server.mjs`：官方 MCP SDK + MCP Apps 的 Streamable HTTP 样例；`npm run probe:serve` 后只监听 `127.0.0.1:8879`，路径 `/mcp`，`/health`；按 Ctrl-C 停止。
- `plugins/navigator-iframe-probe/widget.html`：用明显的测试卡片标记 iframe，显示 `window.openai` 桥接检测结果；卡片是**插件工具结果组件**，不是宿主对话目录条。
- `plugins/navigator-iframe-probe/thread-directory.mjs`：把已知线程的完整轮次转换为稳定 ID 与短提问标题；不返回回答正文。
- `plugins/navigator-iframe-probe/directory-widget.html`：为目录工具提供 iframe 内的标题筛选；不会自动识别当前宿主会话，也没有点击后滚动宿主历史消息的能力。
- `plugins/navigator-iframe-probe/thread-search.mjs` 与 `search-widget.html`：对显式已知线程的完整已取得历史作内存字符串匹配，并在工具结果卡片中显示回答和提问的短片段。每次最多显示 200 处，更多命中会标明截断；正文不写入数据库。因 App Server 读取可能对某些旧线程失败，失败时不宣称搜索完整。
- `plugins/navigator-iframe-probe/.codex-plugin/plugin.json` 与 `.mcp.json`：Codex 插件样例元数据和本机 MCP 地址。新版本 `0.1.0+codex.20260928084433` 已安装且启用；重启本机服务后，通过真实 Streamable HTTP 协议列举出 `search_known_thread` 等 3 个工具。安装缓存保留了 `127.0.0.1:8879/mcp` 配置。
- `npm test`：68 项通过；插件还通过 plugin-creator 校验。本机回环 HTTP 协议调用与用户提供的两张 Codex 截图分别证明探针、真实线程目录卡片在工具结果区域渲染。截图显示筛选框，但尚未实测在宿主卡片内输入关键词后的行为；全文搜索卡片亦待宿主截图验证。

## 两种界面的实际显示验收步骤

1. **Chat**：按[官方 MCP/UI 快速入门](https://developers.openai.com/plugins/build/app-quickstart)运行样例，并用受支持的 HTTPS 接入方式将 `/mcp` 暴露给 Chat 开发模式；创建开发插件，在一个测试 Chat 中选择插件并要求调用 `show_navigator_placement_probe`。记录卡片相对于用户消息、回答、工具结果和原生目录条的位置，以及浅色/深色截图。当前没有 HTTPS 接入，因此这一项尚未执行。
2. **Codex**：探针卡片和新版目录卡片均已在真实工具结果区域显示。插件 `0.1.0+codex.20260928084433` 已安装，`launchctl` 服务运行并通过健康检查。新的 Codex 测试会话对明确知道的线程 ID 调用 `list_known_thread_directory` 后，用户截图显示 10 条真实目录数据。下一次需在新任务里调用 `search_known_thread`，以验证搜索卡片在实际宿主中显示；卡片内筛选、反复切换会话与停用回退仍需实测。撤销服务用 `launchctl remove codex-ui-iframe-probe`，撤销插件用 `codex plugin remove navigator-iframe-probe@codex-ui-local`。
3. 两边都只在**实际宿主中的工具调用结果**出现卡片，才可记为“iframe 显示位置通过”。`/widget` 独立网页、MCP Inspector 和协议单测只能验证样例本身。即使 iframe 在两个界面都显示，也还不能证明能读取 Chat 完整历史或控制宿主目录条与滚动。

截图由用户主动提供；没有为了取得截图而绕过本任务此前收到的 Codex 应用 Computer Use 访问拒绝，未使用 CDP、AppleScript 或宿主注入。G0 中“Codex 工具结果 iframe 显示”与“显式已知线程目录显示”子项已验证；当前会话自动识别、原生目录条挂载与点击定位闭环仍为 `NOT_VERIFIED`。

## 本次应用完整性检查

2026-09-28 在只读执行 `npm run verify:codex` 时，`/Applications/ChatGPT.app` 的 Bundle ID 和 Team ID 仍分别为 `com.openai.codex`、`2DC432GLL2`，但 `codesign --verify --strict` 报 `invalid signature (code or signature have been modified)`，`Info.plist` 与主程序的 spot hash 也与 `20260924-2241` 基线不同，因此该检查返回失败。仅凭这些结果不能判定原因；插件更新没有修改应用包。本次不刷新基线，也不宣称应用包完整性验证通过。
