# 共享导航核心：实现与审查记录

## 状态

2026-09-27：新增宿主无关的接口和控制器，未连接真实宿主，也尚未替换现有 preview 阅读控制器。G1 部分实现；G0、G3、G4 未通过。支持询问尚未发送，正文见 OPENAI_HOST_EXTENSION_INQUIRY.md。

## 新增行为

- ConversationIdentity 明确 surface/thread/branch/window；使用元组序列化，避免简单分隔符键冲突。
- ConversationHost 约定历史分页、稳定消息 ID、目标加载、文本范围定位、布局稳定、内容增量、身份和用户操作订阅及 dispose。compensationOwner 必须明确原生或扩展单方负责。
- NavigationSession 切换宿主时取消任务、清空当前正文、解除订阅并 dispose；重复挂载同一实例不重复注册。
- 历史和定位独立取消通道，定位与恢复共用 movement 通道；每一步 await 后检查代次和 AbortSignal。老加载即使忽略取消，也不能提交给新会话。
- 历史正文只存在内存。分页终点必须明确 coverage=complete 才标记整条完整；partial/failed 都不能宣称完整。检测重复 cursor 和冲突的完整性声明。
- 完整历史重载更新编辑内容并移除删除消息；加载期间订阅到的新文字优先于旧分页结果。
- 每个搜索命中保留回答身份及范围，跳转先加载目标再等待布局，随后向 host 传递原始目标范围，不退回用户提问。
- 恢复按四维身份校验；程序化移动期间不捕获锚点，用户意图立即取消 movement。锚点显式携带身份；旧 thread-only 数据仍可使用原 resolver 进行明确迁移，不能被新 controller 静默接纳。
- 新 scoped resolver 保留原有 block→message→turn 降级，在身份匹配后才执行。

## 验证

npm test：59 passed，0 failed；构建与 git diff --check 通过。新增 session 测试覆盖分页、完整性、重复 cursor、A→B 异步竞争、连续跳转、主动滚动取消、跨 surface/branch/window 恢复、程序滚动捕获暂停、流式更新优先级、历史编辑/删除、分支切换清理、重复挂载。新增 scoped resolver 测试验证身份边界及同轮降级。

## 接入责任与未完成部分

- 这些测试使用内存 host stub，不能作为真实 Chat/Codex adapter 验证。
- 尚无经过验证的完整历史读取接口、历史加载和宿主 reveal API。这里的契约不代表宿主已提供这些 API。
- host 必须在真实滚动/DOM 写入前检查 signal，并在用户主动操作或身份变化时停止自身未完成的工作；核心无法撤回一个不遵守取消契约的宿主调用。
- coverage=complete 是 host 提供的证据；G0 必须验证其来源，不能从 DOM 已加载内容猜测。
- 内容增量订阅目前约定为消息 upsert；删除、重新分支或内容替换需要重新加载 authoritative history，不能把未通知的删除视为即时可见。
- 完整性依赖固定分支历史。宿主若不能提供稳定分页快照，需要适配器先解决一致性，不可在历史分支变化中拼接页后宣布完整。
- 本轮没有引入猜测的 Chat selector，没有注入、修改或启动官方应用，没有实现真实宿主滚动补偿，也没有新增持久化正文。
- 新 identity 字段尚未接入 SQLite 迁移或旧 preview 的持久化流程。旧版本行为保留；不能宣称重启和双窗口真实恢复已完成。
- 阅读块 hash、块内精确恢复、原生目录条联动以及完整几何/性能验收仍需后续工作。

## G0 后的最小真实闭环

得到受支持接口与允许的测试渠道后，在一个明确的测试分支先验证稳定身份、读取已知历史目标、加载目标、定位实际消息范围，再 dispose；检查无 UI/监听残留、原生滚动正常。任一步失败均记录原始结果，不扩展到真实双界面完整验收。
