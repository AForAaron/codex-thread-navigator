# 官方插件与宿主 UI 接入调查（2026-09-28）

## 结论

官方明确允许在 Chat、Work、Codex 使用同一套插件，并允许 MCP 工具返回自定义 UI；这回答了“插件能否有 UI”：能。但文档化的 UI 是对话旁的 iframe 组件，当前公开接口未显示插件能改桌面宿主的消息 DOM、原生目录条、滚动容器或阅读位置。不能从“可创建 UI”推导“可改宿主对话 UI”。

Codex 有一条此前仓库遗漏的官方数据接口：独立 App Server 的 `thread/read` 设置 `includeTurns: true` 可读取已存储线程的轮次；`thread/turns/list` 与 `thread/items/list` 是实验性分页接口。它们是 Codex 线程数据接口，不是桌面窗口当前可见消息、Chat 全史或滚动控制接口；`thread/read` 要求先知道 threadId，且不恢复线程或订阅事件。仓库原先声称“没有文档化历史读取 RPC”过于宽泛，本轮已修正代码注释和报错。

## 官方接入路径与能力边界

| 层 | 官方接入方式 | 已确认能做 | 尚未确认／不能推断 |
| --- | --- | --- | --- |
| 插件分发 | 根 `plugin.json`；本地／仓库 marketplace；在桌面 Plugins Directory 安装 | 同一插件可在 Chat 和 Codex 被发现和调用 | 安装本身不会获得宿主 DOM 权限 |
| 插件可视化 | MCP 工具返回 `_meta.ui.resourceUri` 的 UI resource；MCP Apps bridge、可选 `window.openai` | 在 iframe 组件中显示交互 UI；请求弹层、全屏等；在发送 follow-up 时可选择不自动滚到底部 | 未找到任意读取宿主消息节点、增删宿主目录条、恢复阅读锚点或滚到任意历史消息的公开方法 |
| Codex 数据 | Codex App Server `thread/read(includeTurns: true)`；实验性 `thread/turns/list(itemsView: full)`、`thread/items/list` | 用已知 threadId 读取持久化轮次或分页条目；无需 resume | 不提供桌面 UI 当前会话／分支与窗口绑定，也不负责宿主渲染与定位；尚未验证本机版本和数据覆盖 |
| Chat 数据 | 通用插件输入、输出和经授权的工具数据 | 可得到本次工具调用的输入、输出及可选匿名 session 元数据 | 未找到整个当前 Chat 对话历史及稳定消息 ID 的公开插件 API |
| 生命周期 hooks | Codex 支持插件随包配置 hooks | 可在 Codex 运行时特定事件执行命令或 MCP 工具 | hooks 不是宿主渲染生命周期或滚动观察 API |

## 来源

- 官方插件通用性与组成：https://learn.chatgpt.com/docs/plugins
- 官方 UI iframe 与 MCP Apps：https://developers.openai.com/plugins/build/chatgpt-ui
- 官方 `window.openai` 能力列表：https://developers.openai.com/plugins/reference
- 官方 Codex App Server 线程 API：https://learn.chatgpt.com/docs/app-server
- 官方插件打包、本地 marketplace：https://developers.openai.com/plugins/build/plugins
- 官方插件数据最小化规范：https://developers.openai.com/plugins/app-guidelines
- 官方 Codex hooks：https://learn.chatgpt.com/docs/hooks

这些链接只证明其中明确记载的能力。“未找到”指本轮核对的公开文档没有给出接口，不等于证明 OpenAI 永远不会开放或不存在私有接口。

## 对四项能力的影响

1. 历史提问：Codex 独立数据读取有正式路径；桌面当前窗口与原生 rail 联动仍缺公开接入证据。Chat 无对应全史接口证据。
2. 阅读恢复：插件 widgetState 仅保存 widget 自己的状态；不是宿主阅读位置。宿主阅读锚点捕获／恢复仍缺接口。
3. 稳定阅读：未找到独占宿主滚动补偿、监听布局变化或禁止原生自动跟随的插件接口。
4. 整条搜索：Codex 已知线程可用 App Server 数据构建独立搜索；Chat 全史和直接定位回答仍缺接口。官方插件指南强调不得“以防万一”索取整条历史或原始 transcript；如开放此能力，需要目的最小化与用户授权设计。

## 可实施而不冒充 G0 的下一步

- 可以在项目内为 Codex App Server 的已知线程开发只读数据客户端，单独验证完整轮次提取，不接管桌面窗口。此处需先验证本机 App Server 版本、线程模型与当前窗口 ID 的合法来源。
- 可将独立导航索引做成官方 plugin 的 iframe UI，但它只能作为辅助面板，无法满足原定“Chat 原生同款目录条嵌入宿主”的完成定义。
- 正式支持询问聚焦两个缺口：桌面宿主 renderer 扩展点与 Chat 当前分支全史 API。没有答复前维持 G0 未通过，不启动第三方注入工具或把浏览器扩展当成本机 Electron 注入。

## 本轮未执行

没有安装官方 plugin、启用 developer mode、注册 MCP server、调用真实 App Server 读取会话或操作宿主 UI。实际接入与停用闭环未验证。
