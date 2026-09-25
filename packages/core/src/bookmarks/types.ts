export type BookmarkKind = "turn" | "message" | "heading";

export interface BookmarkIndex {
  id: string;
  threadId: string;
  kind: BookmarkKind;
  turnId: string;
  itemId?: string;
  headingId?: string;
  blockHash?: string;
  title: string;
  orphaned?: boolean;
  createdAt: number;
}

export function bookmarkId(input: Pick<BookmarkIndex, "threadId" | "kind" | "turnId" | "itemId" | "headingId">): string {
  return [input.threadId, input.kind, input.turnId, input.itemId ?? "", input.headingId ?? ""].join(":");
}

export function markOrphanedBookmarks(bookmarks: BookmarkIndex[], liveThreadIds: readonly string[]): BookmarkIndex[] {
  const live = new Set(liveThreadIds);
  return bookmarks.map((row) => ({ ...row, orphaned: !live.has(row.threadId) }));
}

export function preferBookmarkKind(visibleHeadingId: string | null | undefined): BookmarkKind {
  if (visibleHeadingId) return "heading";
  return "message";
}
