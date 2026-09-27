export const THREAD_MAIN = "thread_preview_nav_001";
export const THREAD_OUTLINE = "thread_preview_outline_001";
export const THREAD_STRESS = "thread_preview_stress_001";
export const THREAD_STRESS_500 = "thread_preview_stress_500";
export const THREAD_STRESS_1000 = "thread_preview_stress_1000";
export const THREAD_ORPHAN = "thread_preview_orphan_001";

export const PREVIEW_THREAD_ID = THREAD_MAIN;

export interface PreviewBlock {
  role: "user" | "assistant";
  turnId: string;
  itemId: string;
  itemIndex: number;
  body: string;
  html?: string;
}

export interface PreviewFixture {
  threadId: string;
  title: string;
  blocks: PreviewBlock[];
}

export interface ThreadCatalogEntry {
  threadId: string;
  title: string;
  live: boolean;
}

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

function qa(
  index: number,
  turn: string,
  user: string,
  sections: Array<{ level: 2 | 3; title: string; body: string }>,
): PreviewBlock[] {
  const html = sections
    .map((section, i) => {
      const id = `${turn}-h${section.level}-${i + 1}`;
      return `<h${section.level} id="${id}">${section.title}</h${section.level}><p>${section.body}</p>`;
    })
    .join("");
  return [
    {
      role: "user",
      turnId: `turn_u_${turn}`,
      itemId: `item_u_${turn}`,
      itemIndex: index,
      body: user,
    },
    {
      role: "assistant",
      turnId: `turn_a_${turn}`,
      itemId: `item_a_${turn}`,
      itemIndex: index,
      body: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      html,
    },
  ];
}

export function buildMainFixture(): PreviewFixture {
  const blocks: PreviewBlock[] = [
    ...qa(0, "api", "如何给 Codex 接入外来 API？我想走官方 Responses API，而不是改 Desktop 本体。", [
      { level: 2, title: "先分清两条路", body: "一条是官方 Responses API：你的后端拿 key 调模型。另一条是改 ChatGPT.app，这条预览和 Navigator 都不会走。" },
      { level: 3, title: "推荐做法", body: "把外来能力做成你自己的服务，Codex 只通过对话和工具调用去用它。Desktop 包保持官方签名。" },
    ]),
    ...qa(1, "volc", "火山方舟怎么接到 Responses API？网关、模型名和鉴权应该怎么配才不会和主会话打架？", [
      { level: 2, title: "火山方舟只做网关", body: "把火山方舟当成 OpenAI 兼容入口。模型名写方舟控制台里的接入点，不要写 Desktop 内部的 catalog id。" },
      { level: 3, title: "鉴权", body: "Key 放在你的后端或本地 .env，Navigator 索引库里只存 thread/turn/hash，绝不存 token。" },
    ]),
    ...qa(2, "plugin", "Explodex 插件能不能做长对话导航？我只想要右侧 Prompt 列表，不要主题也不要 launcher。", [
      { level: 2, title: "可以，但默认不要注入", body: "Explodex 只是以后的挂载面。现在这条预览已经把 Navigator 的产品面做完：提问列表、大纲、书签、搜索。" },
      { level: 3, title: "插件边界", body: "面板默认关闭。打开后也只读 DOM 锚点，不改 composer，不读 ~/.codex。" },
    ]),
    ...qa(3, "nav", "长对话导航具体要解决什么？我翻到第 40 轮就找不到自己刚问的那句。", [
      { level: 2, title: "三件套", body: "提问列表跳转、当前轮次高亮、Jump Latest。大纲只认回复里的显式标题，不做 AI 分段。" },
      { level: 3, title: "为什么像 IDE 大纲", body: "序号加截断标题，一眼能扫。点某一问，中间对话区滚到那一轮。" },
    ]),
    ...qa(4, "explodex", "本机没有 Codex.app，只有 ChatGPT.app，Explodex 文档却要打开 Codex.app，怎么办？", [
      { level: 2, title: "不要造别名", body: "本机 Codex Desktop 就是 ChatGPT.app，bundle id 仍是 com.openai.codex。不要在 /Applications 做 Codex.app 符号链接。" },
      { level: 3, title: "当前策略", body: "独立预览验收产品；接 Desktop 必须另开一轮，并且默认不注入。" },
    ]),
    ...qa(5, "restore", "阅读位置怎样跨刷新恢复？关掉自动恢复之后应该停在顶部吗？", [
      { level: 2, title: "按 thread 存锚点", body: "每个对话记 turn、item、hash 和滚动偏移。刷新后用三级回退找回那一轮。" },
      { level: 3, title: "可关闭", body: "设置里关掉自动恢复后，刷新不再跳走，方便对照。" },
    ]),
    ...qa(6, "index", "Navigator 为什么只存索引不存正文？书签会不会把整段回答写进 SQLite？", [
      { level: 2, title: "只存路标", body: "thread / turn / item / hash / offset / 短标题。正文留在 Codex 自己的库里。" },
      { level: 3, title: "书签也一样", body: "书签是指针。导出 Navigator Data 时会检查 body、transcript 这类禁止字段。" },
    ]),
    ...qa(7, "viewport", "Viewport Lock 为什么只能在预览开？我怕接到 Desktop 后滚动会被锁死。", [
      { level: 2, title: "预览才能补偿", body: "假对话区是我们渲的，Follow 可以在距底 80px 时贴住，上滚就松开。" },
      { level: 3, title: "真实 adapter 默认 no-op", body: "Desktop 的 lockViewport 直接返回 DISABLED，避免把官方 thread-scroll 拽走。" },
    ]),
    ...qa(8, "search", "搜索是搜全部历史，还是只搜当前已经加载出来的轮次？", [
      { level: 2, title: "只搜已加载 turns", body: "预览里就是 fixture 全文。不会去调 experimental thread/search，也不会读真实对话库。" },
      { level: 3, title: "可以试这些词", body: "搜「火山方舟」或「Responses API」会落到对应提问。匹配行会短暂高亮。" },
    ]),
    ...qa(9, "bookmark", "书签要支持哪些粒度？我想像 IDE 一样收藏某一节标题。", [
      { level: 2, title: "三种指针", body: "Turn、Message、Heading。⌥⌘B 优先当前可见标题，否则落到消息或轮次。" },
      { level: 3, title: "Orphan", body: "对话从目录消失后，书签打 orphaned，不立刻删，避免误伤。" },
    ]),
    ...qa(10, "outlineq", "Outline 没有标题的回答会怎样？会不会用模型自动分段？", [
      { level: 2, title: "只认 h1 到 h4", body: "当前可见的 assistant 回复里有显式标题才进大纲。没有就空着。" },
      { level: 3, title: "第一版不做 AI 分段", body: "自动分段不稳定，也会把索引搞脏。请在回答里自己写标题。" },
    ]),
    ...qa(11, "keymap", "页内快捷键和系统全局热键有什么区别？改绑之后会不会写进 macOS？", [
      { level: 2, title: "只在预览页生效", body: "⌘⇧N 开关面板，⌘⇧F 搜索，⌥⌘B 收藏。改绑存在预览 localStorage，不注册系统热键。" },
      { level: 3, title: "输入框里不抢键", body: "焦点在设置或搜索框时，除 Esc 外不触发导航快捷键。" },
    ]),
    ...qa(12, "safe", "Safe Mode 怎么回到原生 Codex？会不会误删登录态？", [
      { level: 2, title: "直接打开 ChatGPT.app", body: "不要跑 explodex，不要带 remote debugging。需要时删掉 ~/.explodex/plugins/codex-navigator。" },
      { level: 3, title: "不要删这些", body: "不要删 ~/Library/Application Support/Codex，也不要为了修 Navigator 去动 ~/.codex。" },
    ]),
    ...qa(13, "export", "导出 Navigator Data 会带上对话正文吗？我想备份书签和阅读位置。", [
      { level: 2, title: "只导出索引", body: "anchors、bookmarks、titles、prefs。没有 prompt_text，也没有 transcript。" },
      { level: 3, title: "自检", body: "导出前会扫禁止字段。如果误把正文塞进去，状态会告诉你泄漏的 key。" },
    ]),
    ...qa(14, "theme", "浅色和深色怎么切？会不会影响真实 Codex 的主题？", [
      { level: 2, title: "只影响预览", body: "跟随系统，或在设置里选 light / dark。这是预览壳的色面，不会写进 ChatGPT.app。" },
      { level: 3, title: "侧栏可拖宽", body: "左边那条细缝可以改 Navigator 宽度，下次打开还在。" },
    ]),
    ...qa(15, "follow", "我在中间读的时候模型还在生成，视口会被拽到最底吗？", [
      { level: 2, title: "跟随会松开", body: "你往上滚就不再贴住底部。新块出来时视口不动，只出现「新内容」提示。" },
      { level: 3, title: "怎么验收", body: "停在中间某问，点「模拟生成」。看到提示后再跳到最新。距底部很近时会自动跟上。" },
    ]),
  ];
  return { threadId: THREAD_MAIN, title: "给 Codex 做长对话导航", blocks };
}

export function buildOutlineHeadingsHtml(): string {
  const titles = [
    "背景与动机",
    "产品目标",
    "数据锚点",
    "Thread 与会话",
    "Turn 与 Item",
    "Hash 与正文隔离",
    "提问列表",
    "大纲规则",
    "书签三种粒度",
    "搜索范围",
    "阅读位置",
    "三级回退",
    "Follow 模式",
    "Viewport Lock",
    "Explodex 边界",
    "Safe Mode",
    "导出索引",
    "Orphan 书签",
    "页内快捷键",
    "验收清单",
  ];
  const parts: string[] = ["<p>下面用二十个标题说明 Navigator。这一页用来验收大纲跳转。</p>"];
  titles.forEach((title, i) => {
    const level = ((i % 4) + 1) as 1 | 2 | 3 | 4;
    const id = `outline-h-${String(i + 1).padStart(2, "0")}`;
    parts.push(`<h${level} id="${id}">${title}</h${level}><p>${title}的说明。可搜索「验收清单」跳到最后一节。</p>`);
  });
  return parts.join("");
}

export function buildOutlineFixture(): PreviewFixture {
  const html = buildOutlineHeadingsHtml();
  return {
    threadId: THREAD_OUTLINE,
    title: "大纲样例 · 20 个标题",
    blocks: [
      {
        role: "user",
        turnId: "turn_u_outline",
        itemId: "item_u_outline",
        itemIndex: 0,
        body: "请写一份 Codex Navigator 的产品说明，用二十个中文标题组织，方便我验收大纲跳转。",
      },
      {
        role: "assistant",
        turnId: "turn_a_outline",
        itemId: "item_a_outline",
        itemIndex: 0,
        body: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        html,
      },
    ],
  };
}

export function buildStressFixture(count = 90, threadId = THREAD_STRESS): PreviewFixture {
  const blocks: PreviewBlock[] = [];
  for (let i = 1; i <= count; i++) {
    blocks.push({
      role: "user",
      turnId: `turn_u_${pad(i)}`,
      itemId: `item_u_${pad(i)}`,
      itemIndex: i - 1,
      body: `压力会话第 ${pad(i)} 问：用来测长列表滚动和搜索性能，不是默认打开的对话。`,
    });
    blocks.push({
      role: "assistant",
      turnId: `turn_a_${pad(i)}`,
      itemId: `item_a_${pad(i)}`,
      itemIndex: i - 1,
      body: `这是第 ${pad(i)} 轮的简短回复，仅用于长会话压力测试。`,
    });
  }
  return { threadId, title: `长会话压力 ${count} 轮（开发）`, blocks };
}

export function buildOrphanFixture(): PreviewFixture {
  return {
    threadId: THREAD_ORPHAN,
    title: "将从目录移除的对话",
    blocks: [
      {
        role: "user",
        turnId: "turn_u_orphan",
        itemId: "item_u_orphan",
        itemIndex: 0,
        body: "这条对话可以从目录拿掉，用来看书记不删、只标成已失效。",
      },
      {
        role: "assistant",
        turnId: "turn_a_orphan",
        itemId: "item_a_orphan",
        itemIndex: 0,
        body: "好。移除目录后，书签应显示为已失效，而不是被立刻删除。",
      },
    ],
  };
}

export const PREVIEW_FIXTURES: Record<string, PreviewFixture> = {
  [THREAD_MAIN]: buildMainFixture(),
  [THREAD_OUTLINE]: buildOutlineFixture(),
  [THREAD_STRESS]: buildStressFixture(),
  [THREAD_STRESS_500]: buildStressFixture(500, THREAD_STRESS_500),
  [THREAD_STRESS_1000]: buildStressFixture(1000, THREAD_STRESS_1000),
  [THREAD_ORPHAN]: buildOrphanFixture(),
};

export const PREVIEW_FIXTURE = PREVIEW_FIXTURES[THREAD_MAIN]!;
export const PREVIEW_USER_COUNT = PREVIEW_FIXTURE.blocks.filter((b) => b.role === "user").length;
export const PREVIEW_LAST_USER_TURN = "turn_u_follow";
export const PREVIEW_STRESS_LAST_USER_TURN = "turn_u_090";

export function defaultCatalog(): ThreadCatalogEntry[] {
  return [
    { threadId: THREAD_MAIN, title: PREVIEW_FIXTURES[THREAD_MAIN]!.title, live: true },
    { threadId: THREAD_OUTLINE, title: PREVIEW_FIXTURES[THREAD_OUTLINE]!.title, live: true },
    { threadId: THREAD_STRESS, title: PREVIEW_FIXTURES[THREAD_STRESS]!.title, live: true },
    { threadId: THREAD_STRESS_500, title: PREVIEW_FIXTURES[THREAD_STRESS_500]!.title, live: true },
    { threadId: THREAD_STRESS_1000, title: PREVIEW_FIXTURES[THREAD_STRESS_1000]!.title, live: true },
    { threadId: THREAD_ORPHAN, title: PREVIEW_FIXTURES[THREAD_ORPHAN]!.title, live: true },
  ];
}
