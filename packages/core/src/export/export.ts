const BODY_KEYS = ["body", "prompt_text", "message_text", "transcript", "content_text"];

export interface NavigatorExport {
  exportedAt: number;
  threads: Array<{ threadId: string; title: string | null }>;
  anchors: Array<{ threadId: string; turnId?: string; itemId?: string; itemIndex?: number; blockHash?: string; offset?: number }>;
  bookmarks: Array<{
    id: string;
    threadId: string;
    kind: string;
    turnId: string;
    itemId?: string;
    headingId?: string;
    title: string;
    orphaned?: boolean;
  }>;
  preferences: Record<string, unknown>;
}

export function buildNavigatorExport(input: Omit<NavigatorExport, "exportedAt">, now = Date.now()): NavigatorExport {
  return { exportedAt: now, ...input };
}

export function exportForbiddenKeys(value: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (BODY_KEYS.includes(key)) hits.push(next);
      hits.push(...exportForbiddenKeys(child, next));
    }
  }
  return hits;
}
