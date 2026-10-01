# 2026-09-28 真实环境实测记录

## 结论

只读应用基线与真实本机索引的隔离副本端到端测试已执行。官方 Chat/Codex 宿主窗口接入、目录条、阅读恢复与全文搜索的真实验收没有执行；G0 仍为 NOT_VERIFIED。本记录不能作为真实双界面验收表。

## 环境与执行

| 检查 | 实际命令或渠道 | 可核对结果 | 界限 |
| --- | --- | --- | --- |
| 应用存在、身份与签名 | `npm run g0:check`，2026-09-28 08:29:41 Asia/Shanghai | `/Applications/ChatGPT.app` 存在；`com.openai.codex`，26.924.22138，build 11645；应用与主可执行文件均返回 `invalid signature (code or signature have been modified)`；退出码 2 | 只读，不定位签名失败原因；未检查窗口内容 |
| 真实本机索引副本 | `npm run e2e:index` | 实际线程 ID（非 fixture），选中索引含 60 个提问；页面加载、选择写入临时 SQLite、书签、设置切换通过，6 项全部 PASS；原数据库 mtime 未变 | Chrome 展示的是独立 `desktop-index.html`，不是 Chat/Codex 宿主窗口；测试先复制真实本机索引到临时库 |
| 共享核心 | `npm test` | 59 passed，0 failed，构建通过 | 单元测试与模拟 host，不是宿主 API 的真实行为 |
| 官方支持表单 | Computer Use 浏览器状态读取 | 本轮超时；上一轮 IAB 和已连接 Edge 浏览器打开支持页也超时 | 没有看到表单、没有发送询问、没有工单号 |
| 宿主 UI | `com.openai.codex` Computer Use | 此前申请被自动审批明确拒绝；本轮没有重试或改用 CDP、AppleScript、间接注入等方式 | 用户授权已经明确，但工具限制仍生效；挂载、定位与 dispose 均未执行 |

## 09:08 补充：App Server 与插件 UI 样例

后续只读验证证明，一个已知 Codex 线程可由官方 App Server 的实验性分页接口读取到全部 10 轮、55 条 user/agent 消息，且连续两次返回的轮次 ID 和消息 ID 一致。较长线程仍遇到 `subagent-completed` 项反序列化错误，因此不能外推为所有线程可完整读取。官方 MCP Apps iframe 样例通过 SDK 与本机 HTTP 协议测试，但尚未在 Chat 或 Codex 宿主中安装、调用或观察显示位置。命令、数据边界和后续验收步骤见 [APP_SERVER_AND_IFRAME_PROBE_20260928.md](APP_SERVER_AND_IFRAME_PROBE_20260928.md)。这没有改变上方 G0 与四项能力的真实宿主验收状态。

14:25 Asia/Shanghai 更新：用户已在 `codex-ui-local` 本地 marketplace 安装 `navigator-iframe-probe`。只读检查确认 `installed=true`、`enabled=true`；本机 MCP 服务由可撤销的 `launchctl` 用户任务运行，`127.0.0.1:8879/health` 返回 `{"ok":true}`。尚未在新的 Codex 会话中实际调用工具或看到 iframe；因此“Codex 宿主显示位置”仍为未验证。此样例没有配置网页 Chat 接入。

15:34 Asia/Shanghai 更新：用户提供的 Codex 截图显示探针 iframe 确实位于工具结果区域，且 `window.openai` 可用；此前“Codex 宿主显示位置未验证”的记录由此更新为**探针工具结果 iframe 已验证**。随后新增 `list_known_thread_directory`：只接受显式线程 ID，端到端 MCP 调用从此前已知线程返回 10 个短标题条目，目录 UI resource 的 MIME 为 `text/html;profile=mcp-app`；65 项测试通过。新版目录卡片在 Codex 的实际渲染、自动识别当前会话、点击后定位宿主消息、阅读恢复与全文搜索均未验证或尚不具备。G0 整体仍未通过。

16:32 Asia/Shanghai 更新：用户又提供一个新的 Codex 测试会话截图。`list_known_thread_directory` 针对明确给出的线程 ID 返回完整 10 轮，截图中真实宿主工具结果区显示“Codex 已知线程目录”卡片、标题列表与筛选框。因此“新版目录卡片在 Codex 实际渲染”已通过。截图不证明卡片内筛选交互、当前会话自动识别、点击轮次后滚动原生对话、阅读恢复或全文搜索；这些仍未验收。截图包含真实提问短标题，没有复制进仓库或公开产物。

## 四项能力在真实宿主的验收状态

| 能力 | Chat | Codex |
| --- | --- | --- |
| 目录条回到历史提问 | 未验证 | 未验证；原生条存在静态包证据，但本轮未观察真实交互 |
| 切换／刷新／重启恢复 | 未验证 | 未验证 |
| 历史阅读位置稳定 | 未验证 | 未验证 |
| 当前显示分支整条全文搜索 | 未验证 | 未验证 |

## 可撤销闭环

识别会话 → 读取完整历史 → 加载目标 → 定位 → 卸载恢复：Chat 与 Codex 两边均未开始。没有挂载扩展，因而无需在宿主执行撤销；这不构成卸载恢复通过。

## 下一条件

1. 通过官方支持入口提交 `OPENAI_HOST_EXTENSION_INQUIRY.md` 的现成正文并记录工单号／原始答复。未成功发送前，不更新状态为“已提交”。
2. 官方若提供受支持的宿主扩展与真实测试渠道，先以单个测试会话验证完整闭环。
3. 在渠道未开放前，预览和本机索引回归可持续进行，但不得被标为真实 Chat/Codex 验收。
