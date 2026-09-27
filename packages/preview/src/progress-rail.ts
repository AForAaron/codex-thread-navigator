import { previewSnippet, previewTitle } from "../../core/src/reading/progress.ts";
import { currentPrompt } from "./reading-viewport.ts";

export interface ProgressTurn { turnId: string; title: string; snippet: string }
export interface ProgressRailApi {
  root: HTMLElement;
  attach(viewport: HTMLElement): void;
  sync(): void;
  refresh(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** Independent implementation of the measured native marker geometry and neighbor expansion. */
export function createProgressRail(options: { onJump: (turnId: string) => void }): ProgressRailApi {
  const root = document.createElement("nav");
  root.className = "cn-progress";
  root.dataset.cn = "conversation-progress";
  root.dataset.orientation = "codex";
  root.setAttribute("aria-label", "对话提问目录");
  const track = document.createElement("div");
  track.className = "cn-progress-track";
  track.dataset.cn = "conversation-progress-track";
  const preview = document.createElement("div");
  preview.className = "cn-progress-preview";
  preview.dataset.cn = "conversation-progress-preview";
  preview.id = "cn-progress-preview";
  preview.setAttribute("role", "tooltip");
  preview.hidden = true;
  const title = document.createElement("strong");
  const body = document.createElement("p");
  preview.append(title, body);
  root.append(track, preview);
  let viewport: HTMLElement | null = null;
  let turns: ProgressTurn[] = [];
  let buttons: HTMLButtonElement[] = [];
  let hoverIndex = -1;
  let activeIndex = -1;
  let visible = true;
  let scrubbing = false;
  let frame = 0;

  function paintHover(index: number): void {
    if (hoverIndex === index) return;
    const old = hoverIndex;
    hoverIndex = index;
    for (const i of new Set([old - 3, old - 2, old - 1, old, old + 1, old + 2, old + 3, index - 3, index - 2, index - 1, index, index + 1, index + 2, index + 3])) {
      const button = buttons[i]; if (!button) continue;
      const distance = index < 0 ? 4 : Math.abs(i - index);
      const progress = distance === 0 ? 1 : distance === 1 ? .7 : distance === 2 ? .4 : distance === 3 ? .2 : 0;
      button.style.setProperty("--marker-progress", String(progress));
      button.toggleAttribute("data-scrub-target", i === index);
    }
  }
  function show(index: number): void {
    const turn = turns[index]; const button = buttons[index];
    if (!turn || !button) return;
    paintHover(index);
    title.textContent = turn.title; body.textContent = turn.snippet || "暂无回答";
    preview.hidden = false;
    const rootRect = root.getBoundingClientRect();
    const y = button.getBoundingClientRect().top - rootRect.top;
    preview.style.top = `${Math.max(0, Math.min(rootRect.height - 80, y - 20))}px`;
    root.dataset.hoverTurn = turn.turnId;
    root.dataset.hoverIndex = String(index);
    root.dataset.previewOpen = "true";
    button.setAttribute("aria-describedby", preview.id);
  }
  function hide(): void {
    if (buttons[hoverIndex]) buttons[hoverIndex]!.removeAttribute("aria-describedby");
    paintHover(-1); preview.hidden = true;
    root.dataset.previewOpen = "false";
    delete root.dataset.hoverTurn;
  }
  function sync(): void {
    if (!viewport) return;
    const id = currentPrompt(viewport);
    const index = turns.findIndex(turn => turn.turnId === id);
    if (buttons[activeIndex]) buttons[activeIndex]!.removeAttribute("aria-current");
    activeIndex = index;
    buttons[index]?.setAttribute("aria-current", "true");
    root.dataset.currentTurn = id ?? "";
    root.dataset.currentIndex = String(index);
  }
  function refresh(): void {
    if (!viewport) return;
    hide();
    const articles = [...viewport.querySelectorAll<HTMLElement>(".preview-turn")];
    turns = articles.filter(node => node.dataset.role === "user").map(user => {
      let answer = user.nextElementSibling as HTMLElement | null;
      while (answer && answer.dataset.role !== "assistant" && answer.dataset.role !== "user") answer = answer.nextElementSibling as HTMLElement | null;
      return { turnId: user.dataset.turnId ?? "", title: previewTitle(user.innerText), snippet: previewSnippet(answer?.dataset.role === "assistant" ? answer.innerText : "", 140) };
    });
    buttons = turns.map((turn, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "cn-progress-item";
      button.dataset.turnId = turn.turnId;
      button.setAttribute("aria-label", `跳到第 ${index + 1} 次提问：${turn.title}`);
      const marker = document.createElement("span"); marker.className = "cn-progress-marker";
      marker.setAttribute("aria-hidden", "true"); button.append(marker);
      button.addEventListener("pointerenter", () => show(index));
      button.addEventListener("focus", () => show(index));
      button.addEventListener("click", () => { options.onJump(turn.turnId); sync(); });
      button.addEventListener("keydown", event => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)))]?.focus();
        }
        if (event.key === "Escape") hide();
      });
      return button;
    });
    track.replaceChildren(...buttons);
    activeIndex = -1;
    root.dataset.turnCount = String(turns.length);
    // Native component omits the rail for fewer than four prompts.
    root.hidden = !visible || turns.length < 4;
    sync();
  }
  root.addEventListener("pointerleave", () => { if (!scrubbing) hide(); });
  root.addEventListener("focusout", event => { if (!root.contains(event.relatedTarget as Node | null)) hide(); });
  track.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    scrubbing = true; root.dataset.scrubbing = "true";
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener("pointermove", event => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const index = Math.max(0, Math.min(turns.length - 1, Math.floor((event.clientY - rect.top + track.scrollTop) / 8)));
      show(index);
    });
  });
  track.addEventListener("pointerup", event => {
    if (scrubbing && hoverIndex >= 0) options.onJump(turns[hoverIndex]!.turnId);
    scrubbing = false; delete root.dataset.scrubbing;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    sync();
  });
  const cancel = () => { scrubbing = false; delete root.dataset.scrubbing; };
  track.addEventListener("pointercancel", cancel);
  track.addEventListener("lostpointercapture", cancel);
  return { root, attach(next) { viewport = next; refresh(); }, sync, refresh,
    setVisible(value) { visible = value; root.hidden = !value || turns.length < 4; if (!value) hide(); },
    dispose() { cancelAnimationFrame(frame); viewport = null; root.remove(); },
  };
}

export const PROGRESS_RAIL_CSS = `
.cn-progress { position:absolute; left:16px; top:50%; transform:translateY(-50%); width:26px; z-index:5; }
.cn-progress[hidden], .cn-progress-preview[hidden] { display:none !important; }
.cn-progress-track { display:flex; flex-direction:column; max-height:min(70vh,40rem); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:none; }
.cn-progress-track::-webkit-scrollbar { display:none; }
.cn-progress-item { --marker-progress:0; flex:0 0 8px; height:8px; width:26px; margin:0; padding:3px 0; border:0; background:transparent; cursor:pointer; color:#a3a3a3; display:flex; align-items:center; }
.cn-progress-marker { width:26px; height:2px; background:currentColor; opacity:.4; transform:scaleX(calc(.2308 + .7692 * var(--marker-progress))); transform-origin:0; transition:transform .16s linear(0,.398 10%,.682 20%,.843 30%,.925 40%,.972 50%,1.004 60%,1.008 70%,1.003 80%,1); }
.cn-progress-item[aria-current=true] { color:#ececec; }
.cn-progress-item[aria-current=true] .cn-progress-marker { opacity:.6; }
.cn-progress-item[data-scrub-target], .cn-progress-item:focus-visible { color:#ececec; outline:none; }
.cn-progress-item[data-scrub-target] .cn-progress-marker, .cn-progress-item:focus-visible .cn-progress-marker { opacity:1; }
.cn-progress[data-scrubbing] .cn-progress-marker { transition-duration:0s; }
.cn-progress-preview { position:absolute; left:38px; width:min(300px,calc(100vw - 110px)); padding:12px 14px; background:#2a2a2a; color:#ececec; border-radius:12px; box-shadow:0 8px 24px rgb(0 0 0 / .3); pointer-events:none; }
.cn-progress-preview strong { display:block; font-size:13px; line-height:1.4; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cn-progress-preview p { margin:0; font-size:12px; line-height:1.5; color:#aaa; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
html[data-theme=light] .cn-progress-item { color:#666; }
html[data-theme=light] .cn-progress-item:is([aria-current=true],[data-scrub-target],:focus-visible) { color:#111; }
html[data-theme=light] .cn-progress-preview { background:#fff; color:#111; }
html[data-theme=light] .cn-progress-preview p { color:#666; }
@media (prefers-reduced-motion:reduce) { .cn-progress-marker { transition-duration:0s; } }
::highlight(navigator-search) { background:#e6c35c; color:#161616; }
`;
