# 桌面 Chat 目录与阅读位置：能力探测和接入设计

范围是桌面应用 **ChatGPT → Chat** 中的既有对话。Codex 保留其原生目录、查找和阅读位置行为。本文件区分官方文档证据、本地协议验证、真实 Chat 验证；任一列不能代替另一列。

## 结论与能力门槛

截至 2026-09-28，本项目未取得公开、受支持的 Chat 宿主接口来读取当前显示分支的完整消息及稳定 ID、在正文边缘挂载目录、加载并滚动历史消息、捕获／恢复宿主阅读锚点。已安装的 MCP 插件只提供工具结果 iframe；[插件 UI 文档](https://developers.openai.com/plugins/build/chatgpt-ui)明确其位置与隔离方式。[参考接口](https://developers.openai.com/plugins/reference)的 `window.openai` 提供工具、组件状态、显示模式和跟进消息等能力，没有列出上述宿主控制方法。这里的“未取得”不是断言 OpenAI 内部没有接口。

| 必需能力 | 可用的公开证据 | 真正接入前仍需的证明 |
| --- | --- | --- |
| 当前 Chat 与分支身份 | 工具调用可选 `_meta["openai/session"]` 只关联插件调用 | 宿主提供当前窗口、会话、分支和生命周期通知；匿名 session 不可代替稳定消息 ID |
| 目录所需内容 | API [Conversations](https://developers.openai.com/api/docs/guides/conversation-state)管理开发者 API 会话；用户可[导出历史 ZIP](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data) | 受支持地按页读取当前 Chat 显示分支的轮次与稳定消息 ID，并证明完整性及增量更新 |
| 目录 UI | MCP Apps iframe 可在工具结果、全屏或 PiP 呈现 | 可撤销的 Chat 正文边缘插槽及挂载／卸载生命周期；组件内部导航不算宿主导航 |
| 消息定位 | 桌面内置 [Find in chat](https://learn.chatgpt.com/docs/reference/commands) 可查找文本 | 插件可请求加载未渲染消息，并按消息 ID 和匹配范围定位，返回实际定位结果 |
| 阅读恢复和稳定 | 插件 `widgetState` 保存组件自己的状态；跟进消息可设 `scrollToBottom:false` | 捕获可见内容锚点、恢复、用户意图和布局事件；原生滚动与扩展补偿责任必须明确 |

此外，[发布插件指南](https://developers.openai.com/plugins/app-guidelines)禁止其 MCP server 从客户端或其他位置拉取、重建或推断完整 chat log。若官方后续提供历史读取接口，必须同时确认其使用条件和这条发布规则是否允许当前导航目的；不能默认认为用户安装了插件就授权整条历史转给插件服务。

## 当前可运行的最小探针

新增 `show_chat_host_capability_probe`，无参数、只读，返回“Chat 宿主能力验证”iframe 卡片。卡片仅检查文档化的 `window.openai` 是否存在，以及本工具结果、主题、显示模式和组件状态接口是否可用。它不查看父窗口或宿主 DOM，不读取会话正文或凭证，也不调用宿主滚动。本地 MCP 单测及 `127.0.0.1:8880/mcp` 上的真实 HTTP `tools/list`／`tools/call` 已通过，实际只列出这一个工具并返回 `readsConversation:false`。验证后服务已停止。**仍需在真实 Chat 对话中调用一次，才能确认 Chat 是否显示这张卡片以及具体位置**。

真正给 Chat 开发模式连接时，只使用隔离的 Chat 服务：公开 HTTPS 路径为 `npm run probe:chat:serve`（本地 `127.0.0.1:8880/mcp`），Secure MCP Tunnel 的 stdio 路径为 `node plugins/navigator-iframe-probe/chat-probe-stdio.mjs`。两条路径的 `tools/list` 都严格只有上述一个无数据工具，并已分别通过真实 HTTP／stdio 协议验证。原有 `npm run probe:serve`（`8879`）含 Codex 本机历史读取工具，**不得通过公网 HTTPS 或 Tunnel 对外转发**。[官方接入文档](https://developers.openai.com/plugins/deploy/connect-chatgpt)要求 Chat 开发模式连接公开 HTTPS 端点或 Secure MCP Tunnel；本机 Codex marketplace 的 loopback 安装不等于 Chat 已连接。建立远程连接、刷新插件元数据和在真实 Chat 中调用均尚未执行。

执行记录按以下三类分开：

1. `PROTOCOL_PASS`：MCP `tools/list`、`tools/call`、`resources/read` 正确；仅证明服务和资源。
2. `CHAT_CARD_PASS`：在明确标为 ChatGPT 的普通 Chat 中，工具结果旁显示“Chat 宿主能力验证”，记录位置、主题、折叠行为及组件桥接；不读取正文。
3. `HOST_NAV_PASS`：只有取得下述宿主能力后才可能记录；卡片显示不能晋级成这个结果。

插件源文件更新不会自动证明已安装的缓存包也更新。重新安装和重启服务之前，Chat 测试工具是否在该界面可用仍为 `NOT_VERIFIED`。若 Chat 工具列表没有此工具，记录为插件分发／启用问题，不推断宿主滚动接口不存在。

本机 `tunnel-client` 与 `ngrok` 均未安装。若选择 Secure MCP Tunnel，需有 Platform tunnel 权限和官方 `tunnel-client`；[文档](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)说明它用于私有 MCP 开发测试，但不支持公开插件发布。若选择公网 HTTPS，也只能将 `8880` 的无数据服务暴露出去，不可转发含本机历史读取工具的 `8879`。选择、安装及账号侧创建连接都未发生。

### 条件满足时的真实 Chat 测试操作

优先使用 OpenAI 官方 **Secure MCP Tunnel**。工具卡：本质是将本机私有 MCP 服务连接到 ChatGPT 开发模式的传输层，与现有本地 Codex marketplace 不在同一层；能做（1）让 Chat 调用本机**无数据**探针，（2）避免自建公网入站服务，（3）在 Platform 管理连接；做不到（1）授予 Chat 宿主 DOM 权限，（2）读取整条 Chat 历史，（3）控制原正文滚动。它会接触 Platform tunnel 凭证、一个指定的本机 MCP 进程及工具调用元数据；停用时在 ChatGPT Plugins 中移除连接、停止 `tunnel-client` 并在 Platform 删除 tunnel，必要时撤销凭证；不装的代价是无法经这条路径验证真实 Chat 插件卡片。参考[官方接入](https://developers.openai.com/plugins/deploy/connect-chatgpt)与[隧道指南](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。

如果账号具有 Developer mode 与 Tunnel 创建／使用权限：

1. 在 OpenAI Platform 的 Tunnel 设置创建或选用测试 tunnel，并按官方文档安装 `tunnel-client`。凭证只在本人设备或 Platform 流程中配置，不贴入对话或项目文件。
2. 配置 **stdio MCP command** 指向本仓库 `plugins/navigator-iframe-probe/chat-probe-stdio.mjs` 的本机绝对路径，使用本机 Node 22+ 执行。先运行官方 `doctor`，确认只连接这个无数据工具；不要指向 `server.mjs` 或端口 `8879`。
3. 在 ChatGPT 的 Developer mode → Plugins 中选择 Tunnel 连接，刷新元数据，确认工具列表**只有** `show_chat_host_capability_probe`。若出现任何 Codex 历史工具，立即移除连接并检查配置。
4. 在桌面应用明确切到普通 **Chat**，开一条无敏感内容的新测试对话，选择该插件，请求“调用 `show_chat_host_capability_probe` 一次并显示卡片”。记录卡片出现在工具结果、正文边缘还是别处，以及卡片内的桥接、主题、展示模式结果；只报告这些状态，不提供对话正文。
5. 从 ChatGPT Plugins 中移除测试连接并停止 `tunnel-client`。记录卡片是否消失、原对话操作是否正常。若此前创建了专用 tunnel，再从 Platform 删除或停用。

如果没有 Tunnel 权限，官方另允许公网 HTTPS MCP 端点；必须只转发 `8880` 的无数据服务，并在创建连接前独立确认目标 URL 的 `tools/list` 仅含该工具。此路径需要额外公网暴露与访问控制设计，不因为本机 Codex 插件已安装而自动成立。

## 有宿主接口时的实现

保留 `packages/core/src/navigation/host.ts` 的 `ConversationHost` 为唯一接入边界；新增的 Chat adapter 只通过经过官方确认的宿主方法实现以下流程：

```text
Chat 窗口/分支事件
  → 建立带代次的 ConversationIdentity
  → 读取当前分支完整分页历史并校验稳定 turn/item ID
  → 在宿主目录插槽挂载一根与原生基线一致的目录条
  → 点击目标：ensureTargetLoaded → waitForLayout → revealTarget
  → 滚动停止：捕获内容块 hash + 块内位置 + 相对视口偏移
  → 切换/刷新/重启：按相同窗口与分支身份恢复；用户滚动立即取消
  → dispose：取消未完成任务、移除监听和目录、交还滚动责任
```

`NavigationSession` 已按 `history`／`movement` 分任务取消，并在身份改变时清理；Chat adapter 不得通过标题匹配、DOM 序号或猜测 selector 造 ID。若宿主只给消息级定位、不提供正文块和视口几何，则目录跳转可以单独试验，但阅读位置精确恢复及 4 px 稳定性不能宣称完成。若原生已承担滚动补偿，`compensationOwner` 应为 `native`，扩展只观察而不再次调整视口。

数据策略：搜索索引正文仅驻当前分支的内存；持久化仅留身份、ID、hash、短标题和阅读锚点。多窗口按窗口 ID 分隔，分支切换取消旧任务。若历史覆盖不完整，搜索显示“结果尚不完整”；不能把局部结果标为整条搜索。正式接入前还需检查插件发布规则是否允许该历史读取范围。

## 只有数据接口、没有宿主 UI 接口时

可以做**独立目录**：对插件自身管理的 API 会话或用户明确提供的材料，生成轮次列表和本地搜索，并在 iframe 内筛选、滚动。不能让它模拟点击原 Chat 正文，不能保存或恢复原 Chat 的阅读位置，也不能称作“安装到 Chat 的原生同款目录”。[ChatKit](https://developers.openai.com/api/docs/guides/chatkit)可在**自有**聊天产品中实现完整目录和滚动；[历史导出](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)可做离线阅读器；二者都不是本项目的桌面 Chat 接入完成标准。企业 [Compliance API](https://learn.chatgpt.com/docs/enterprise/compliance-api)面向管理员审计和调查，权限、覆盖和时效不适合作为个人实时阅读导航后端。

另已排除两条表面接近的官方路径：[浏览器扩展](https://learn.chatgpt.com/docs/chrome-extension)控制的是网页标签，不是桌面应用的 Chat 正文；[Record & Replay](https://learn.chatgpt.com/docs/extend/record-and-replay)把示范操作封装为技能，不提供消息级宿主 API，且其所依赖的 [Computer Use 明确不能自动操作 ChatGPT 自身](https://learn.chatgpt.com/docs/computer-use)。这些路径不能补足当前 G0。

## 正式接口答复后的一次性验收

用一条不含敏感数据的测试 Chat，记录应用版本、插件版本、权限和撤销方式。依次验证：读取当前分支全部 ID；选择一条尚未渲染的早期提问并真实加载、跳转；选择回答专属词并定位回答命中；在长回答中段切到 B 再回 A，刷新和重启后回到同一内容块；生成和布局变化时相对视口偏移不超过 4 CSS px；连续快速跳转、切换和卸载后无旧任务滚动。浅色／深色目录几何对照以原生基线为准。只有每项都有真实 Chat 证据，才将 `HOST_NAV_PASS` 写入验收表。

## 仍需 OpenAI 明确回答

1. 有无面向第三方插件的 **Chat 当前窗口／分支历史 API**？能否提供稳定 turn/item ID、分页完整性、增量订阅以及取得当前显示身份的方法？发布插件的数据边界是否允许此用途？
2. 有无 **Chat 正文边缘 UI 插槽**，可挂载并卸载目录条，而非仅渲染 MCP iframe？有哪些兼容版本？
3. 有无 **消息级加载和 reveal API**，支持回答中的匹配范围，并返回定位完成信号？
4. 有无 **阅读锚点和布局事件 API**，可区分用户滚动与程序化滚动，并明确原生／扩展滚动补偿责任？

若四组接口均无，保留现有原生查找与插件结果卡片，不采用未文档化的 Electron、CDP、AppleScript 或宿主 DOM 注入来冒充受支持安装。
