import { parseCodexRateLimits } from "../../core/src/quota/codex-rate-limits.ts";
import type { UsageIndicatorState } from "./ui/usage-indicator.ts";

export interface RateLimitsBridge {
  isAvailable(): boolean;
  rpc?(method: string, params?: Record<string, unknown>): Promise<unknown | null>;
}

/** Only account/rateLimits/read is sent. Reads reset-credit count; never redeems credits. */
export function startUsageController(
  bridge: RateLimitsBridge | undefined,
  setState: (state: UsageIndicatorState) => void,
  intervalMs = 60_000,
): () => void {
  let active = true;
  let generation = 0;
  const refresh = async () => {
    const current = ++generation;
    if (!bridge?.isAvailable() || !bridge.rpc) {
      setState({ kind: "unavailable", reason: "此接入没有可用的额度读取接口。" });
      return;
    }
    try {
      const response = await bridge.rpc("account/rateLimits/read");
      if (!active || current !== generation) return;
      const limits = parseCodexRateLimits(response);
      setState(limits
        ? { kind: "ready", limits, updatedAt: Date.now() }
        : { kind: "unavailable", reason: "当前账户未返回 Codex 额度数据。" });
    } catch {
      if (active && current === generation) {
        setState({ kind: "unavailable", reason: "额度读取失败；稍后会自动重试。" });
      }
    }
  };
  void refresh();
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, intervalMs);
  const onVisibility = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    active = false;
    generation++;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
