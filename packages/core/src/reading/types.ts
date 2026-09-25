export type RestoreTier = "turn+item+block" | "turn+item" | "turn" | "none";

export interface ReadingAnchor {
  threadId: string;
  turnId?: string;
  itemId?: string;
  itemIndex?: number;
  blockHash?: string;
  contentHash?: string;
  offset?: number;
}

export interface RestoreCandidate {
  turnId: string;
  itemId?: string;
  itemIndex?: number;
  blockHash?: string;
}

export type RestoreResult =
  | { ok: true; candidate: RestoreCandidate; tier: Exclude<RestoreTier, "none"> }
  | { ok: false; tier: "none" };
