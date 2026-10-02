# Codex Provider Switcher 实现设计

日期：2026-10-01。交付类型：实现规格；未启用切换、未修改用户配置、未读取 Keychain。

## 目标与当前证据

在 Codex 左侧窄栏的额度区下方、原生底部按钮区域上方增加独立 Provider 按钮。OpenAI 使用原生模型选择器；OpenCode Go 使用自己的模型菜单；能恢复切换前的 OpenAI 配置。

当前 `docs/CODEX_USAGE_RAIL_20261001.md` 与 `scripts/inject-usage-rail.mjs` 已记录/实现 Explodex 会话级渲染接入；额度来自独立只读 app-server。README 的“未安装、不注入”描述与当前材料冲突。本规格依据当前代码和当日接入记录，不将历史验收等同于本轮实时验收。

显示按钮与改变宿主推理路由是两个能力。独立启动的 app-server 改变自己的会话，不能据此声称改变桌面已有会话。未找到官方侧栏按钮扩展契约；采用现有非官方渲染接入，逐版本验证。

## 交互

窄栏按钮尺寸 36×36 CSS px，点击范围尽量扩展到 44×44，不与额度、更新、设置或头像重叠。图标采用双向切换，悬停显示“模型来源：Codex / OpenAI”或“模型来源：OpenCode Go · 模型名”。不把用量百分比塞进按钮。

点击打开右侧 304–336 px 弹层，按以下顺序排列：

1. 标题“模型来源”，下一行显示当前实际生效来源与适用范围。
2. Codex / OpenAI 单选项，辅助文案“模型和推理强度使用 Codex 原生选择器”。
3. OpenCode Go 单选项，选中后展开模型列表；记住上次 Go 模型。未测试模型标注“待验证”，协议不兼容模型不进入可选列表。
4. 来源用量区：OpenAI 额度保持原有窄栏；Go 有可靠数据时展示剩余比例、重置时间、来源与更新时间，否则显示“用量暂不可读取”及“打开 OpenCode 控制台”。
5. 底部主操作，依据实际能力显示“应用到新对话”或“保存并在重启后应用”。仅通过已有会话切换验收后，才能出现“应用到当前对话”。取消或 Esc 丢弃未提交选择。

只有收到宿主实际使用 provider/model 的可靠证据才显示成功勾选。保存配置完成时显示“已保存，待应用”，不能显示“已切换”。对话运行中不即时切换，不自动中断任务；允许保存待应用选择。

OpenAI 原生模型菜单不重写、不注入第三方项。Go 模式时在弹层提示“Go 模型由此处选择”；须验证原生模型选择是否覆盖 Go 路由。如会覆盖且无法通过受支持接口协调，该路径不交付为稳定切换。

## 布局与状态

沿用 usage-placement 的底部原生区域锚点与空间判断。额度和 Provider 按钮由同一容器布局，避免两个独立绝对定位相互覆盖。弹层单独挂载并约束于视口；只在 Codex 表面显示，普通 Chat 不出现。宿主结构不匹配或空间不足时隐藏扩展，给本地控制台留下诊断。

状态：未配置 → 可选择 → 选择未提交 → 验证/保存中 → 待应用 → 已生效。异常包括 Keychain 未找到、系统授权被拒、401、429、网络失败、模型/工具协议不兼容、配置外部变更、宿主无法确认生效。错误保留原来源，允许重试；不会静默换模型或换来源。

键盘支持 Tab、方向键、Enter、Esc，弹层关闭后焦点回到按钮。提供可访问名称与 aria-expanded，状态不能仅靠颜色区分；深浅主题跟随宿主，减少动效偏好下禁用过渡。

## 实现分层

建议新增以下独立模块，不扩张已有只读历史客户端的 RPC 白名单：

- `packages/plugin/src/ui/provider-switcher.ts`：按钮、弹层、状态渲染，只接收脱敏数据。
- `packages/plugin/src/provider-controller.ts`：用户意图与宿主能力协调，不读取密钥。
- `packages/core/src/providers/types.ts`：selected / persisted / effective 三类状态，来源、模型与作用范围。
- `packages/core/src/providers/catalog.ts`：显式模型 ID、协议与验证状态，不自动把服务返回的全部模型设为可用。
- `scripts/provider-switch-service.mjs`：独立本地配置写入服务，职责与只读额度服务分开。
- `packages/core/src/providers/config-transaction.ts`：TOML 定向编辑、备份、并发检测与恢复。

本地服务仅接受明确来源、模型枚举和固定操作；不能执行 UI 传入的任意命令。绑定 loopback，校验请求来源与会话授权，防止其他网页调用写配置接口。密钥只由认证命令流入推理进程，不能通过 CDP、浏览器响应、日志或前端状态传递。

## 配置与恢复契约

用户级配置定义 `model_providers.opencode_go`，base_url 为 `https://opencode.ai/zen/go/v1`，wire_api 为 `responses`。`auth.command` 使用 `/usr/bin/security`，args 指定真实 Keychain service/account；这些名称待用户提供或另行核实，不能猜测。命令输出仅给认证消费者，不送前端。不同时设置 env_key、experimental_bearer_token 或 requires_openai_auth。

profiles 可组织 Go 模型配置，但不预设 Desktop 能热切 profile。落地顺序：先验证安装版本支持的配置解析及实际生效生命周期，再确定主操作。初版以新对话/重启边界设计；只有经过宿主已有会话测试才开放热切换。

首次应用前保存 OpenAI 相关键原值及“原本不存在”的状态，涵盖 model、model_provider、profile 和影响模型能力的显式覆盖项。备份留本地，日志不复制配置正文。写入前核对文件哈希；外部变化则停止并重新读取。以原子替换提交，保留无关 TOML 配置和注释。恢复时仅恢复本功能修改的键；冲突键不得静默覆盖。恢复原生来源不会 logout、替换 auth.json 或清除登录。

配置写入不能保证当前线程换来源。历史对话若仍绑定旧来源，界面必须显示这个事实。跨来源延续上下文可能把历史内容发送给另一服务；初版使用新对话，不自动复制历史。

## 模型与用量

当前官方 Go 文档列出的 Responses 模型候选：gpt-6-luna、gpt-5.6-luna、grok-4.7、grok-4.6、muse-spark-1.3-contributor、muse-spark-1.2-contributor。协议匹配只允许进入兼容性验证，不等于 Desktop 工具功能已验证。推理强度仅呈现模型明确支持且测试通过的值，不继承 OpenAI 全部档位。

OpenAI 额度沿用 account/rateLimits/read；Go 的控制台是本轮已核实的用量查看入口，公开可用的额度 API 未建立证据。无数据用 null，不用 0。token/request 本地统计仅代表此客户端，不可换算为套餐剩余百分比。Go 月度或其他周期依据真实接口字段展示，不写死 5h/周/月三个窗口。不自动打开 Zen 余额兜底计费。

## 实施与验收顺序

1. 独立交互原型：覆盖两来源、Go 模型选择、待应用/错误/恢复、深浅主题。注明模拟，不改变真实路由。
2. 宿主能力验证：确认安装版本、配置解析、Keychain 命令认证、新线程 provider/model 实际路由、配置变更生命周期。未通过则保留方案，不能包装成一键已生效。
3. 接入配置事务：只写所需用户级字段；验证正常恢复、原值缺失恢复、外部编辑冲突、异常中断。
4. 在真实窄栏挂载按钮：更新按钮出现、缩小窗口、Chat/Codex 切换、重启、卸载均不影响原生交互。
5. 验证真实推理：流式文本、工具调用及返回、取消、长上下文、MCP/桌面工具 schema。逐模型记录已验证范围。

交付标准：OpenAI 原生模型选择仍正常；Go 的真实请求使用明确选定 ID；切回恢复原配置；执行中的任务不会被点击按钮中断；已保存和已生效清楚分开；缺失额度显示不可读取；停止接入后所有新增 UI 清除；密钥不进入前端或日志。

## 来源

- OpenAI 配置参考：https://learn.chatgpt.com/docs/config-file/config-reference
- OpenAI 桌面设置：https://learn.chatgpt.com/docs/reference/settings
- OpenCode Go 模型、端点与用量入口：https://opencode.ai/docs/go/
- 本项目当前会话接入记录：`docs/CODEX_USAGE_RAIL_20261001.md`
- 本项目接入实现：`scripts/inject-usage-rail.mjs`、`scripts/launch-usage-rail.sh`
