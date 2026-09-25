/** 5-hour session quota only. No weekly / money / token fields. */

export type QuotaSource = "disconnected" | "fixture";

export interface SessionQuota {
  connected: boolean;
  remainingPercent: number | null;
  resetAt: number | null;
  source: QuotaSource;
  reason?: string;
}

export function disconnectedQuota(): SessionQuota {
  return {
    connected: false,
    remainingPercent: null,
    resetAt: null,
    source: "disconnected",
    reason: "no-safe-source",
  };
}

/** Dev/e2e only. Never the default product reading. */
export function fixtureSessionQuota(now = Date.now()): SessionQuota {
  return {
    connected: true,
    remainingPercent: 93,
    resetAt: now + (4 * 60 + 58) * 60 * 1000,
    source: "fixture",
  };
}

export function formatResetRemain(resetAt: number, now = Date.now()): string {
  const ms = Math.max(0, resetAt - now);
  const totalMin = Math.round(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return `${minutes}m 后重置`;
  return `${hours}h${String(minutes).padStart(2, "0")}m 后重置`;
}

export function formatQuotaLine(quota: SessionQuota, now = Date.now()): string {
  if (!quota.connected || quota.remainingPercent == null) return "会话额度未连接";
  const reset = quota.resetAt != null ? formatResetRemain(quota.resetAt, now) : "重置时间未知";
  return `会话剩余 ${Math.round(quota.remainingPercent)}% · ${reset}`;
}
