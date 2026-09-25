import { THREAD_MAIN, THREAD_ORPHAN, THREAD_OUTLINE, THREAD_STRESS } from "./fixture.ts";

export type RailIcon = "compose" | "image" | "clock" | "plugin" | "more" | "circle" | "folder" | "globe" | "code";

export interface RailRow {
  id: string;
  title: string;
  icon: RailIcon;
  threadId?: string;
  kind: "action" | "pin" | "project" | "thread";
  dot?: boolean;
}

export interface ThreadRailApi {
  root: HTMLElement;
  setActive(threadId: string): void;
  setVisible(visible: boolean): void;
}

const ICONS: Record<RailIcon, string> = {
  compose:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 6.5h-6A1.5 1.5 0 0 0 5 8v10a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18 18v-6"/><path d="M17.2 5.2a1.2 1.2 0 0 1 1.6 1.6L12 13.6 9.5 14.5l.9-2.5 6.8-6.8Z"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6" width="15" height="12" rx="2"/><path d="m6.5 15.2 3.2-3.2a1 1 0 0 1 1.4 0l3.1 3.1m1.4-1.5 1.9 1.9"/><circle cx="9" cy="10" r="1.1"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><path d="M12 8.5V12l2.8 1.8"/></svg>',
  plugin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.5h7v3h2.2a1.3 1.3 0 0 1 1.3 1.3V17a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 17v-6.2a1.3 1.3 0 0 1 1.3-1.3H9.5v-3Z"/><path d="M10 6.5V5m4 1.5V5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="cx-fill" cx="7" cy="12" r="1.35"/><circle class="cx-fill" cx="12" cy="12" r="1.35"/><circle class="cx-fill" cx="17" cy="12" r="1.35"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
  folder:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 8.2V7.4A1.4 1.4 0 0 1 6.2 6h4.1l1.6 1.7h6.3A1.4 1.4 0 0 1 19.6 9.1v8.1a1.4 1.4 0 0 1-1.4 1.4H6.2A1.4 1.4 0 0 1 4.8 17.2V8.2Z"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><path d="M5.2 12h13.6M12 4.8c2.2 2.2 3.3 4.7 3.3 7.2S14.2 17 12 19.2C9.8 17 8.7 14.5 8.7 12S9.8 7 12 4.8Z"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 8.2-3.4 3.8 3.4 3.8M15.8 8.2l3.4 3.8-3.4 3.8M13.2 6.6 10.8 17.4"/></svg>',
};

const ACTIONS: RailRow[] = [
  { id: "new", title: "新聊天", icon: "compose", kind: "action" },
  { id: "images", title: "图像", icon: "image", kind: "action" },
  { id: "schedule", title: "定时任务", icon: "clock", kind: "action", dot: true },
  { id: "plugins", title: "插件", icon: "plugin", kind: "action" },
  { id: "explore", title: "探索", icon: "more", kind: "action" },
];

export function previewRailRows(): { pins: RailRow[]; projects: RailRow[]; threads: RailRow[] } {
  return {
    pins: [{ id: "pin-main", title: "给 Codex 做长对话导航", icon: "circle", kind: "pin", threadId: THREAD_MAIN }],
    projects: [
      { id: "proj-outline", title: "大纲样例", icon: "folder", kind: "project", threadId: THREAD_OUTLINE, dot: true },
      { id: "proj-stress", title: "长会话压力", icon: "code", kind: "project", threadId: THREAD_STRESS },
      { id: "proj-archive", title: "归档", icon: "globe", kind: "project", threadId: THREAD_ORPHAN },
    ],
    threads: [{ id: "th-outline", title: "大纲 20 个标题", icon: "circle", kind: "thread", threadId: THREAD_OUTLINE }],
  };
}

function iconEl(name: RailIcon): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "cx-icon";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = ICONS[name];
  return wrap;
}

function rowEl(row: RailRow, onPick: (row: RailRow) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cx-row";
  btn.dataset.railId = row.id;
  if (row.threadId) btn.dataset.threadId = row.threadId;
  btn.dataset.kind = row.kind;
  const title = document.createElement("span");
  title.className = "cx-row-title";
  title.textContent = row.title;
  btn.append(iconEl(row.icon), title);
  if (row.dot) {
    const dot = document.createElement("span");
    dot.className = "cx-dot";
    dot.setAttribute("aria-hidden", "true");
    btn.append(dot);
  }
  btn.addEventListener("click", () => onPick(row));
  return btn;
}

export function createThreadRail(options: {
  activeThreadId: string;
  onThread: (threadId: string) => void;
}): ThreadRailApi {
  const { pins, projects, threads } = previewRailRows();
  const root = document.createElement("nav");
  root.className = "cx-rail";
  root.dataset.cn = "conversation-rail";
  root.setAttribute("aria-label", "对话选择");

  const actions = document.createElement("div");
  actions.className = "cx-actions";
  for (const row of ACTIONS) {
    const btn = rowEl(row, () => {
      root.dataset.lastAction = row.id;
    });
    btn.dataset.cnAction = row.id;
    actions.append(btn);
  }

  const makeSection = (label: string, rows: RailRow[], key: string) => {
    const wrap = document.createElement("section");
    wrap.className = "cx-section";
    wrap.dataset.section = key;
    const h = document.createElement("h2");
    h.textContent = label;
    wrap.append(h);
    for (const row of rows) wrap.append(rowEl(row, (picked) => picked.threadId && options.onThread(picked.threadId)));
    return wrap;
  };

  root.append(
    actions,
    makeSection("置顶", pins, "pins"),
    makeSection("项目", projects, "projects"),
    makeSection("对话", threads, "threads"),
  );

  const setActive = (threadId: string) => {
    for (const btn of root.querySelectorAll<HTMLElement>(".cx-row")) {
      btn.classList.toggle("cx-active", btn.dataset.threadId === threadId && btn.dataset.kind !== "action");
    }
  };
  setActive(options.activeThreadId);

  return {
    root,
    setActive,
    setVisible(visible) {
      root.hidden = !visible;
    },
  };
}

export const THREAD_RAIL_CSS = `
.cx-rail {
  width: 260px; flex: 0 0 260px; height: 100%; overflow: auto;
  background: #171717; color: #ececec;
  border-right: 1px solid #2a2a2a;
  font: 14px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  padding: 10px 8px 20px;
  box-sizing: border-box;
}
.cx-rail[hidden] { display: none !important; }
.cx-actions { display: flex; flex-direction: column; gap: 1px; margin-bottom: 18px; }
.cx-section { margin: 14px 0 2px; }
.cx-section h2 {
  margin: 0 12px 6px; font-size: 12px; font-weight: 500; color: #8e8e8e;
}
.cx-row {
  width: 100%; display: flex; align-items: center; gap: 10px;
  border: 0; background: transparent; color: inherit; text-align: left;
  min-height: 36px; padding: 8px 12px; border-radius: 8px; cursor: pointer; font: inherit;
}
.cx-row:hover { background: #212121; }
.cx-row.cx-active { background: #2f2f2f; }
.cx-icon {
  width: 18px; height: 18px; flex: 0 0 18px; color: #b4b4b4;
  display: inline-flex; align-items: center; justify-content: center;
}
.cx-icon svg {
  width: 18px; height: 18px; fill: none; stroke: currentColor;
  stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
}
.cx-icon svg .cx-fill { fill: currentColor; stroke: none; }
.cx-row-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ececec; }
.cx-dot {
  width: 6px; height: 6px; border-radius: 50%; margin-left: auto;
  background: #7c6af7; flex: 0 0 6px;
}
`;
