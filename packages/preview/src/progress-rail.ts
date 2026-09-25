import { previewSnippet, previewTitle, ratioFromTurnIndex, turnIndexFromRatio } from "../../core/src/reading/progress.ts";

export interface ProgressTurn {
  turnId: string;
  title: string;
  snippet: string;
}

export interface ProgressRailApi {
  root: HTMLElement;
  attach(viewport: HTMLElement): void;
  sync(): void;
  setVisible(visible: boolean): void;
}

function collectTurns(viewport: HTMLElement): ProgressTurn[] {
  const users = [...viewport.querySelectorAll<HTMLElement>('[data-testid="user-message"]')];
  return users.map((user) => {
    let asst = user.nextElementSibling as HTMLElement | null;
    while (asst && asst.dataset.role !== "assistant") asst = asst.nextElementSibling as HTMLElement | null;
    return {
      turnId: user.dataset.turnId ?? "",
      title: previewTitle(user.innerText),
      snippet: previewSnippet(asst?.innerText ?? "", 86),
    };
  });
}

function visibleUserTurnId(viewport: HTMLElement): string | null {
  const root = viewport.getBoundingClientRect();
  let best: { id: string; dist: number } | null = null;
  for (const node of viewport.querySelectorAll<HTMLElement>('[data-testid="user-message"]')) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < root.top + 8 || rect.top > root.bottom - 8) continue;
    const dist = Math.abs(rect.top - root.top);
    if (!best || dist < best.dist) best = { id: node.dataset.turnId ?? "", dist };
  }
  return best?.id || null;
}

export function createProgressRail(options: { onJump: (turnId: string) => void }): ProgressRailApi {
  const root = document.createElement("div");
  root.className = "cn-progress";
  root.dataset.cn = "conversation-progress";
  root.dataset.orientation = "codex";
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", "对话进度");
  root.setAttribute("aria-orientation", "vertical");

  const track = document.createElement("div");
  track.className = "cn-progress-track";
  track.dataset.cn = "conversation-progress-track";
  const current = document.createElement("div");
  current.className = "cn-progress-current";
  current.dataset.cn = "conversation-progress-current";
  const hoverBar = document.createElement("div");
  hoverBar.className = "cn-progress-bar";
  hoverBar.dataset.cn = "conversation-progress-bar";
  hoverBar.hidden = true;
  hoverBar.append(document.createElement("i"), document.createElement("i"));
  const preview = document.createElement("div");
  preview.className = "cn-progress-preview";
  preview.dataset.cn = "conversation-progress-preview";
  preview.hidden = true;
  const previewTitleEl = document.createElement("strong");
  const previewBody = document.createElement("p");
  preview.append(previewTitleEl, previewBody);
  root.append(track, current, hoverBar, preview);

  let viewport: HTMLElement | null = null;
  let turns: ProgressTurn[] = [];
  let hoverIndex = -1;

  const ratioFromClientY = (clientY: number) => {
    const rect = root.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  };

  const showHover = (index: number, clientY: number) => {
    const turn = turns[index];
    if (!turn) {
      hideHover();
      return;
    }
    hoverIndex = index;
    const rect = root.getBoundingClientRect();
    const y = Math.min(rect.height - 8, Math.max(8, clientY - rect.top));
    hoverBar.hidden = false;
    hoverBar.style.top = `${y}px`;
    preview.hidden = false;
    preview.style.top = `${Math.min(rect.height - 88, Math.max(8, y - 36))}px`;
    previewTitleEl.textContent = turn.title;
    previewBody.textContent = turn.snippet;
    root.dataset.hoverTurn = turn.turnId;
    root.dataset.hoverIndex = String(index);
    root.dataset.previewOpen = "true";
    root.classList.add("cn-progress-hot");
  };

  const hideHover = () => {
    hoverIndex = -1;
    hoverBar.hidden = true;
    preview.hidden = true;
    delete root.dataset.hoverTurn;
    delete root.dataset.hoverIndex;
    root.dataset.previewOpen = "false";
    root.classList.remove("cn-progress-hot");
  };

  const sync = () => {
    if (!viewport) return;
    turns = collectTurns(viewport);
    const currentId = visibleUserTurnId(viewport);
    const index = Math.max(0, turns.findIndex((row) => row.turnId === currentId));
    const ratio = ratioFromTurnIndex(index, turns.length);
    current.style.top = `${ratio * 100}%`;
    root.dataset.turnCount = String(turns.length);
    root.dataset.currentTurn = currentId ?? "";
    root.dataset.currentIndex = String(index);
  };

  root.addEventListener("pointerenter", () => {
    root.classList.add("cn-progress-hot");
  });
  root.addEventListener("pointerleave", hideHover);
  root.addEventListener("pointermove", (event) => {
    if (!turns.length) return;
    showHover(turnIndexFromRatio(ratioFromClientY(event.clientY), turns.length), event.clientY);
  });
  root.addEventListener("click", (event) => {
    if (!turns.length) return;
    const index = hoverIndex >= 0 ? hoverIndex : turnIndexFromRatio(ratioFromClientY(event.clientY), turns.length);
    const turn = turns[index];
    if (turn?.turnId) options.onJump(turn.turnId);
  });

  return {
    root,
    attach(next) {
      viewport = next;
      sync();
    },
    sync,
    setVisible(visible) {
      root.hidden = !visible;
      if (!visible) hideHover();
    },
  };
}

/** Codex-style left-edge scrubber: faint dashed ticks + short white mark. */
export const PROGRESS_RAIL_CSS = `
.preview-thread-host { position: relative; }
.cn-progress {
  position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 14px; z-index: 5; cursor: pointer;
}
.cn-progress[hidden] { display: none !important; }
.cn-progress-track {
  position: absolute; left: 2px; top: 0; bottom: 0; width: 10px;
  background-image: repeating-linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.22) 0 1px,
    transparent 1px 5px
  );
  opacity: 0.38; pointer-events: none;
}
.cn-progress-hot .cn-progress-track { opacity: 0.55; }
.cn-progress-current {
  position: absolute; left: 1px; width: 12px; height: 2px;
  background: #f2f2f2; border-radius: 1px;
  pointer-events: none; transform: translateY(-50%);
  box-shadow: 0 0 3px rgb(255 255 255 / 0.25);
}
.cn-progress-hot .cn-progress-current { opacity: 0; }
.cn-progress-bar {
  position: absolute; left: 0; width: 14px; height: 7px;
  display: flex; flex-direction: column; justify-content: space-between;
  pointer-events: none; transform: translateY(-50%); z-index: 2;
}
.cn-progress-bar i {
  display: block; height: 2px; background: #fff; border-radius: 1px;
  box-shadow: 0 0 4px rgb(255 255 255 / 0.35);
}
.cn-progress-bar[hidden],
.cn-progress-preview[hidden] { display: none !important; }
.cn-progress-preview {
  position: absolute; left: 22px; width: 300px;
  background: #2a2a2a; color: #ececec;
  border-radius: 14px; padding: 12px 14px 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
  pointer-events: none; z-index: 6;
}
.cn-progress-preview strong {
  display: block; font-size: 13px; font-weight: 600; line-height: 1.35; margin: 0 0 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cn-progress-preview p {
  margin: 0; font-size: 12px; line-height: 1.45; color: #a3a3a3;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
html[data-theme="light"] .cn-progress-track {
  background-image: repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.28) 0 1px, transparent 1px 5px);
}
html[data-theme="light"] .cn-progress-current { background: #222; box-shadow: none; }
html[data-theme="light"] .cn-progress-bar i { background: #111; box-shadow: none; }
html[data-theme="light"] .cn-progress-preview { background: #fff; color: #111; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
html[data-theme="light"] .cn-progress-preview p { color: #6b6b6b; }
`;
