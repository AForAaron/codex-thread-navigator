import { codexUsageWindows, type CodexRateLimits } from "../../../core/src/quota/codex-rate-limits.ts";

/** Three passive readings. No button, overlay, tooltip, or pointer target. */
export const USAGE_INDICATOR_CSS = `
.cn-usage {
  width: 40px;
  height: 92px;
  display: grid;
  align-content: center;
  gap: 6px;
  color: #f1f1f3;
  font: 650 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
.cn-usage-row { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cn-usage-label { color: #b9b9bd; font-size: 9px; font-weight: 500; }
.cn-usage-value[data-low="true"] { color: #ffb6a9; }
@media (prefers-color-scheme: light) {
  .cn-usage { color: #25252a; }
  .cn-usage-label { color: #5b5b62; }
  .cn-usage-value[data-low="true"] { color: #a52716; }
}
`;

export type UsageIndicatorState =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; limits: CodexRateLimits; updatedAt: number };

export function createUsageIndicator(doc: Document = document): {
  root: HTMLOutputElement;
  setState: (state: UsageIndicatorState) => void;
  dispose: () => void;
} {
  const root = doc.createElement("output");
  root.className = "cn-usage";
  const fiveHour = doc.createElement("span");
  const weekly = doc.createElement("span");
  const resetCredits = doc.createElement("span");
  for (const [row, label] of [[fiveHour, "5h"], [weekly, "周"], [resetCredits, "重置"]] as const) {
    row.className = "cn-usage-row";
    const labelNode = doc.createElement("span");
    labelNode.className = "cn-usage-label";
    labelNode.textContent = label;
    const valueNode = doc.createElement("span");
    valueNode.className = "cn-usage-value";
    row.append(labelNode, valueNode);
  }
  root.append(fiveHour, weekly, resetCredits);
  const setValue = (row: HTMLElement, value: string | null, low = false) => {
    const target = row.lastElementChild as HTMLElement;
    target.textContent = value ?? "—";
    if (value === null) target.removeAttribute("data-low");
    else target.dataset.low = String(low);
  };
  const setState = (state: UsageIndicatorState) => {
    if (state.kind !== "ready") {
      setValue(fiveHour, null);
      setValue(weekly, null);
      setValue(resetCredits, null);
      root.setAttribute("aria-label", state.kind === "loading" ? "Codex 额度读取中" : `Codex 额度不可用：${state.reason}`);
      return;
    }
    const windows = codexUsageWindows(state.limits);
    const fiveHourPercent = windows.fiveHour ? Math.round(windows.fiveHour.remainingPercent) : null;
    const weeklyPercent = windows.weekly ? Math.round(windows.weekly.remainingPercent) : null;
    setValue(fiveHour, fiveHourPercent === null ? null : `${fiveHourPercent}%`, fiveHourPercent !== null && fiveHourPercent <= 20);
    setValue(weekly, weeklyPercent === null ? null : `${weeklyPercent}%`, weeklyPercent !== null && weeklyPercent <= 20);
    const resetCount = state.limits.resetCreditsAvailable;
    setValue(resetCredits, resetCount === null ? null : `${resetCount}次`);
    root.setAttribute("aria-label", `Codex 五小时剩余 ${fiveHourPercent === null ? "不可用" : `${fiveHourPercent}%`}，每周剩余 ${weeklyPercent === null ? "不可用" : `${weeklyPercent}%`}，可用手动重置 ${resetCount === null ? "不可用" : `${resetCount}次`}`);
  };
  setState({ kind: "loading" });
  return { root, setState, dispose: () => root.remove() };
}
