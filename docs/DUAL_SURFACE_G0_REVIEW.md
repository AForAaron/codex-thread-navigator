# Chat / Codex 双界面导航：G0 验证记录

检查时间：2026-09-27 22:00（Asia/Shanghai）。

## 结论

**G0 未通过，真实窗口接入未实施；共享阅读逻辑与独立预览已部分实现并测试，G3/G4 未通过。**

目标保持为：同一桌面应用内 Chat 和 Codex 都能定位历史提问、恢复阅读、保持阅读位置稳定、搜索当前显示分支的整条对话。Chat 目录条与 Codex 原生目录条保持一致，Codex 不新增第二根目录条。独立预览不算最终交付。

## 工作区基线

- 基线：`backups/pre-dual-navigation-20260927-220047/workspace.zip`。
- 清单：同目录 `manifest.json`，记录 HEAD、原有工作区状态及每个文件的 SHA-256。
- 共 81 个文件；ZIP 完整性检查通过，确认包含已修改的 README.md 和未跟踪的 LICENSE。
- 基线不包含 node_modules、dist、登录凭证、官方应用或真实会话数据库；不修改备份 LATEST 指针。
- 本次检查前工作区：README.md 已修改，LICENSE 未跟踪；均保留。

## 当前证据与缺口

| 检查项 | 本次证据 | 状态 |
| --- | --- | --- |
| 官方应用载体 | `/Applications/ChatGPT.app`；Bundle ID `com.openai.codex`；版本 `26.924.22138`，build `11645` | 已确认元数据 |
| 应用完整性 | `codesign --verify --strict --verbose=4` 返回 `invalid signature (code or signature have been modified)`，architecture `arm64` | 未通过；原因未确定 |
| 签名身份信息 | `codesign -dv` 显示 Identifier `com.openai.codex`、TeamIdentifier `2DC432GLL2` | 身份字段可读，不代表签名有效 |
| 原生 UI 观察 | 本会话先前的电脑操作工具返回 `Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.` | 工具禁止；未绕过，未重试其他控制方式 |
| Codex adapter | `codex-current.ts` 的 `verifiedOn: null`，候选 selector 来源为旧版本文档 | 当前版本未验证 |
| Chat adapter | 当前 adapters 目录没有 Chat 界面专用实现 | 缺失 |
| 完整历史读取 | AppServer 的 `listUserTurns` 返回 `UNVERIFIED_RPC`；SDK 会话对象开放字段不构成完整历史契约 | 两个界面均未验证完整性 |
| 历史目标加载与定位 | 当前 DomAdapter 仅扫描已有 DOM；没有 `ensureTargetLoaded` / `revealTarget` 闭环 | 缺失 |
| 原生目录条基线 | 没有当前版本、双主题、完整交互状态的原生对照证据 | 缺失 |
| Explodex 路径 | 本地 node_modules 有开发依赖；未发现 `/Applications/Explodex.app`、`~/Applications/Explodex.app`、`~/.explodex`；依赖 README 要求 `/Applications/Codex.app`，该路径不存在 | 不能证明双界面接入可用；未安装或启动 |
| 卸载恢复闭环 | 未进行真实 UI 挂载或卸载 | 未验证 |

签名失败属于本次只读检查观测；不能由此归因于 Navigator、恶意修改、某个更新过程或第三方工具。没有执行修复、重签名、应用替换、解包或应用文件写入。

## G0 继续所需证据

1. 通过允许的观察渠道或用户提供的截图、录屏取得原生目录条基线：双主题，静止、悬停、移动、点击、滚动及生成状态。
2. 在许可范围内验证两个界面的会话/分支身份、滚动容器、消息结构、完整历史来源及未加载目标的加载方式。截图可支持 UI 对照，但不能替代接口和生命周期验证。
3. 明确并验证接入机制及其权限、兼容版本、停用方式；需新增安装或第三方注入时，先提供工具卡并取得对应授权。当前实施请求不等于授权安装、运行注入工具。
4. 查清完整性校验失败的原因，并取得可验证的应用基线；不能仅凭 TeamIdentifier 或版本号把失败判为通过。
5. 对 Chat 和 Codex 分别完成“识别会话 → 读取历史目标 → 加载目标 → 定位 → 卸载恢复”，保存证据后才允许进入 G1。

## 后续实现约束

- 不修改官方应用，不读取登录凭证，不写官方对话数据库，不绕过电脑操作工具的应用访问限制。
- 保存阅读位置必须使用内容锚点与相对视口偏移，不能恢复后再覆盖旧绝对 scrollTop。
- 稳定阅读需覆盖文字流式变化及尺寸变化，不能只观察追加节点。
- 搜索回答必须定位真实命中，不能把跳到所属用户提问视为通过；未取得完整历史时必须显示范围不完整。
- G0 未通过期间，不安装启动 Explodex，不编写基于猜测的真实 Chat selector，不以 fixture 测试充当真实双界面验收。

## 本次交付边界

完成：工作区快照及校验、应用元数据与签名只读检查、仓库/SDK/依赖接入证据核对、本记录。

未完成：原生 UI 基线、真实双界面接入、四项能力的新增实现、真实窗口端到端验收、安装启用。

## 继续推进后的检查

用户已批准继续推进和必要的申请；工具明确禁止访问 Codex 的限制仍然有效，不通过 CDP、AppleScript 或其他渠道绕过。

- 严格深层签名检查仍失败；单独验证 `Contents/MacOS/ChatGPT` 也返回相同的 invalid signature。已把问题缩小到主可执行文件签名校验也不通过，但未确定根因。
- 读取本地 Explodex `lib/platform/macos.mjs` 确认，`CODEX_APP` 和 `CODEX_BIN` 固定为 `/Applications/Codex.app` 及其 MacOS/Codex 可执行文件；不是仅 README 写错，现有打包运行代码也不适配本机路径。未运行该模块。
- 增加 `npm run g0:check`，只执行应用元数据、签名及既定路径存在性检查，不启动应用、不访问 UI、不注入、不修复。失败返回 exit 2；通过这些机器检查也不会宣称 G0 通过，报告始终保留真实界面证据要求。
- 因此目前没有一个已验证、可直接提交安装申请并满足双界面目标的工具方案；不以全局安装 Explodex 或创建 Codex.app 别名代替兼容性验证。

## 原生组件静态证据补充

用户明确提出读取原生 UI 组件后，只读解析 app.asar 的文件索引并在内存读取指定前端文件；没有运行其中代码，没有修改、重打包或重签名应用，没有连接运行中的应用或绕过 UI 工具禁令。

已定位当前安装包的资源：

- `webview/assets/thread-user-message-navigation-rail-app-9f5cc9282f4d.js`（31,947 bytes）。
- `webview/assets/thread-user-message-navigation-rail-app-4265c73f61aa.css`（4,382 bytes）。
- `webview/assets/bookmarked-thread-user-message-navigation-66b382dced83.js`（5,679 bytes）。

原生静态实现显示：独立 marker 基准宽 26px，默认缩放约 0.2308；悬停/焦点目标展开至 1，相邻一、二、三项分别以 0.7、0.4、0.2 进度展开；使用 aria-current 标识当前项；常规动画 0.16s，scrubbing 和 reduced-motion 条件禁用相应过渡。带有指针交互、预览加载/不可用状态、ResizeObserver，以及通过 onRevealItem 加载历史目标再滚动定位的路径。

因此“拿不到原生实现证据”的旧结论已被本次静态检查纠正：可以从打包组件取得结构、样式和交互逻辑证据。没有发现随包提供的 .map 文件，当前读到的是编译后组件，不是原始 TSX/Figma。仍需解析共享依赖和实际挂载入口；没有验证当前窗口是否启用该组件及最终布局/双主题表现。签名失败意味着这些证据准确描述本机当前包的内容，不能额外证明其为未改动的官方发行件。

静态组件证据不等同于真实挂载权限，也不证明两个界面的完整历史加载和恢复闭环已通过；G0 总体状态仍未通过，但原生设计证据取得工作可继续通过静态阅读推进。
