# ChatGPT 桌面 Chat 导航：G0 验证与安装关口

> 2026-10-01 更新：通过非官方、会话级渲染接入，普通 Chat 的**已渲染轮次目录**和内容锚点恢复已在真实窗口通过小范围测试。详见 [CHAT_SESSION_RAIL_20261001.md](./CHAT_SESSION_RAIL_20261001.md)。下面是此前针对**官方受支持接口及完整历史目录**的关口记录；完整历史加载、全尺寸视觉一致性和重启验收仍未通过，不能将新实验称为官方插件或全部 G0 完成。

范围：同一 ChatGPT 桌面应用中的 **Chat** 界面；Codex 界面保留原生目录、查找与阅读位置行为。Work 的截图或 Codex 的探针结果不能替代 Chat 验收。

后续逐项接口探测、只读 Chat 专用探针与正式接入设计见 [CHAT_HOST_INTEGRATION_DESIGN_20260928.md](./CHAT_HOST_INTEGRATION_DESIGN_20260928.md)。

## 当前证据

| 能力 | 已证实 | 未证实／缺口 |
| --- | --- | --- |
| Chat 原生行为 | 官方快捷键文档列出“在对话中查找”；用户截图中一个真实 Chat 窗口在重启后未显示目录刻度 | 其他 Chat 对话是否相同，以及完整历史查找、切换／重启阅读恢复和生成时稳定位置，仍待同一界面验收 |
| 插件分发 | 官方插件目录覆盖 Chat、Work 与 Codex；本项目的本地 marketplace 已安装一个 Codex 测试探针 | 安装不赋予读取宿主消息或操作宿主视口的权限；本探针只读取显式给出的 Codex App Server 线程 |
| 插件 UI | MCP Apps 工具结果可以展示 iframe；Codex 中探针与目录卡片已由用户截图证实 | 公开 UI bridge 没有已验证的常驻 Chat 对话边缘挂载、按消息 ID 滚动宿主、捕获／恢复宿主阅读锚点接口 |
| Chat 全史 | 工具能收到本次调用输入、输出及可选匿名 session 标识 | 未取得当前 Chat 分支完整历史、稳定轮次／消息 ID、未渲染历史加载接口；匿名 session 标识不是历史读取 API |

来源：[桌面命令](https://learn.chatgpt.com/docs/reference/commands)、[插件适用界面](https://learn.chatgpt.com/docs/plugins)、[插件 UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[组件接口](https://developers.openai.com/plugins/reference)、[插件开发准则](https://developers.openai.com/plugins/app-guidelines)。这些页面证明公开接口的已列能力；未找到某接口不等于断言内部绝不存在该接口，因此安装关口要求官方文档或产品方确认。

2026-09-28 用户提供的真实桌面截图中，左侧明确标为 `ChatGPT`，当前普通 Chat 对话在截图所示位置**没有可见的目录刻度条**。这是“该 Chat 窗口此时未显示目录”的直接证据，不单凭一张截图推断所有 Chat 对话或主题都永远没有目录。用户还确认重启应用后仍未见目录。原因不能归结为插件加载失败：现有 `navigator-iframe-probe` 仅是工具结果组件，不包含 Chat 宿主目录挂载或阅读位置控制。

## 2026-09-28 公开接口逐项核对

这里的“未找到”仅指本次核对的公开、受支持文档；不推断 OpenAI 内部实现或未来接口。

| 官方路径 | 实际提供的能力 | 对本项目的界限 |
| --- | --- | --- |
| [插件 MCP 工具和 UI resource](https://developers.openai.com/plugins/build/chatgpt-ui) | 工具输入／输出可供自己的 iframe 使用；`_meta.ui.resourceUri` 把 UI 展示在工具结果中；可用 inline、fullscreen、PiP | iframe 不是宿主对话正文的 DOM 扩展点；未记载对话边缘常驻挂载或宿主消息滚动控制 |
| [插件 UI bridge 与 `window.openai`](https://developers.openai.com/plugins/reference) | 工具调用、跟进消息、模态窗、显示模式、主题、组件状态和高度；`sendFollowUpMessage({scrollToBottom:false})` 只控制**此次发送跟进消息时**不自动到底部 | 没有已记载的读取宿主当前消息 ID、加载任意历史消息、滚动到消息或捕获／恢复宿主阅读锚点的方法；`widgetState` 仅属于组件 |
| [工具调用 `_meta["openai/session"]`](https://developers.openai.com/plugins/reference) | 可选匿名会话标识，供同一 ChatGPT 会话内的工具调用关联 | 不是消息 ID，也不是读取会话、分支或全文的授权句柄 |
| [Conversations + Responses API](https://developers.openai.com/api/docs/guides/conversation-state) | 开发者创建 API `conversation` 后，以其 ID 持久化 API 消息及其他 item | 这是开发者 API 会话；文档没有给出用它读取用户现有 ChatGPT 桌面 Chat 的入口 |
| [ChatKit](https://developers.openai.com/api/docs/guides/chatkit) | 为开发者自己的前端和服务构建可定制聊天界面 | 可以在自有界面实现目录和阅读位置，但不会把目录装入现有 ChatGPT 桌面 Chat |
| [ChatGPT 数据导出](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data) | 用户可申请包含聊天历史的 ZIP，供离线处理 | 不是实时当前会话接口；无法控制宿主正文，且导出可能需要等待 |
| [Codex App Server](https://learn.chatgpt.com/docs/app-server) | `thread/read(includeTurns:true)` 和实验性 `thread/turns/list`、`thread/items/list` 可读 Codex 线程 | 数据范围是 Codex 线程，不等于普通 ChatGPT Chat；也没有桌面宿主视口控制 |
| [桌面命令和 deep link](https://learn.chatgpt.com/docs/reference/commands) | `Find in chat`；可链接至整个本地 Codex 线程 | 没有记载 Chat 消息级 deep link 或阅读锚点接口 |

[插件开发准则](https://developers.openai.com/plugins/app-guidelines) 对**提交发布的插件**还规定：MCP server 不得从客户端或其他位置拉取、重建或推断完整 chat log，只处理客户端／模型明确发送的片段和资源。因此，把多次工具调用或匿名 session 标识拼成完整当前 Chat 对话，不仅缺少文档化接口，也与已发布插件的这条数据边界冲突。该准则的适用范围是发布插件；本地实验仍须单独确认许可和宿主能力，不能据此臆断得到例外。

### “根据对话接口自己做目录”的三种结果

1. **现有桌面 Chat 内、能点击跳到原正文**：仅有对话数据不够。还需要当前窗口／分支对应关系、稳定消息 ID、历史目标加载、宿主滚动和可撤销 UI 挂载；目前未找到这套受支持接口，G0 仍未通过。
2. **插件结果卡片内的目录**：可以针对用户明确提供的有限内容或插件自身管理的数据建目录、在卡片内部筛选／滚动；不能把点击映射为原 Chat 正文跳转，也不能恢复宿主阅读位置。现有 Codex 探针已验证这种卡片形态，不代表 Chat 全史可读。
3. **自有聊天界面或离线阅读器**：API Conversations／ChatKit 能支撑自己管理的新会话；用户导出 ZIP 可支撑静态历史阅读器。两者都能自建目录和自己的阅读位置控制，但不是给现有 ChatGPT 桌面 Chat 安装原生同款目录。

公开文档缺失的关键官方答复是：是否存在面向第三方的 Chat 当前分支完整历史读取、宿主对话边缘 UI 插槽、消息级 reveal/scroll、可见锚点捕获／恢复及布局事件接口；若存在，需文档、版本、权限与停用清理协议。获得这些之前，不能把数据层目录当作宿主接入完成。

## 用户只需完成的 Chat 原生验收

请在桌面应用明确切到 **Chat**，打开一条较长的普通 Chat 对话，分别报告以下结果；无需提供正文或数据库：

1. 目录：左侧是否出现刻度？点击前、中、后刻度是否落到对应提问？
2. 查找：`⌘F` 能否找到早期提问和回答，并滚动到真实命中？
3. 返回：停在长回答中段，切换到另一条 Chat 再回来，是否仍在同一段附近？
4. 重启：在同一位置完整退出应用并重开后，是否仍在同一段附近？
5. 稳定：向上阅读时，同一对话新增内容、图片加载或窗口尺寸变化是否把当前段落拉走？

记录格式：`目录=...；查找=...；切换=...；重启=...；稳定=...`。Work／Codex 的结果另记，不填入 Chat 列。

## 需要官方确认的宿主接口

向 OpenAI 请求明确答复以下四组能力，并附接口文档、支持版本、权限与停用回退方法：

1. Chat 当前窗口的会话与分支标识，以及稳定的轮次、消息 ID。
2. 在用户明确启用导航时，按页读取当前显示分支的全部历史提问和回答，并加载尚未渲染的目标；不能通过匿名 session 元数据推断全文可读。
3. 在 Chat 对话边缘挂载可撤销的目录 UI；按消息 ID 定位提问或回答中的命中内容，而非仅在插件 iframe 内导航。
4. 读取可见内容锚点及其视口偏移，恢复锚点，并订阅用户滚动、流式内容与布局变化；明确与原生自动跟随谁负责补偿。

## 安装关口

2026-09-28 账号与接口补充：用户确认个人 Plus 空间，网页版没有 Developer mode／创建自定义 MCP app 入口，并提供一段 AI 辅助支持回复，称 Plus 没有普通 Chat 自研 MCP 的官方自助测试路径，且目前公开文档未提供第三方控制普通 Chat 正文边缘 UI、历史渲染和滚动锚点的接口。独立核对的[开发模式套餐说明](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)、[桌面 MCP 配置说明](https://learn.chatgpt.com/docs/extend/mcp)及[插件 iframe 说明](https://developers.openai.com/plugins/build/chatgpt-ui)与这两个边界一致。支持回复未附工单号或专门接口文档，记录为用户提供的答复。**当前 Plus 账号的普通 Chat 探针连接不可执行；G0 未通过。** 不安装 Tunnel，也不把升级套餐视为取得宿主接口的解决方案。

- **G0 不通过**：上述宿主能力缺少文档或可复核的最小闭环；不把当前 `navigator-iframe-probe` 装入 Chat 并宣称四项完成。它的 `list_known_thread_directory` 和 `search_known_thread` 面向显式 Codex 线程 ID，不读取 Chat 当前对话。
- **G0 通过**：在一个测试 Chat 中完成“识别会话 → 读取并加载指定历史消息 → 定位 → 记录／恢复阅读锚点 → 停用后清理”的可撤销闭环。然后实现 `ConversationHost` 的 Chat adapter，复用共享跳转、搜索和阅读状态机，完成长线程、切换、重启、流式内容及重复挂载验收。
- **最终安装**：仅在真实 Chat 窗口端到端结果通过、停用回退验证、插件权限与数据边界核对完成后执行。单独预览、Codex 探针卡片或本地测试通过均不算 Chat 安装成功。

如果 OpenAI 只支持工具结果 iframe，官方开发模式可以用 HTTPS MCP 端点或 Secure MCP Tunnel 测试卡片位置；这不会越过上面的宿主接口关口，也不能交付常驻目录与宿主阅读位置控制。
