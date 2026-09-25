export interface FollowState {
  following: boolean;
  unreadNew: boolean;
}

export const FOLLOW_BOTTOM_PX = 80;

export function distanceFromBottom(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function reduceFollow(
  prev: FollowState,
  event:
    | { type: "scroll"; distanceFromBottom: number; deltaY: number }
    | { type: "contentAppended"; distanceFromBottom: number }
    | { type: "jumpLatest" },
): FollowState {
  if (event.type === "jumpLatest") return { following: true, unreadNew: false };
  if (event.type === "scroll") {
    if (event.deltaY < 0) return { following: false, unreadNew: prev.unreadNew };
    if (event.distanceFromBottom < FOLLOW_BOTTOM_PX) return { following: true, unreadNew: false };
    return prev;
  }
  if (event.distanceFromBottom < FOLLOW_BOTTOM_PX) return { following: true, unreadNew: false };
  if (!prev.following) return { following: false, unreadNew: true };
  return { following: true, unreadNew: false };
}

/**
 * Preview-only mutation compensation. When not following, keep the same
 * scrollTop so appended content does not yank the viewport.
 */
export function compensateScroll(input: {
  following: boolean;
  previousScrollTop: number;
  previousHeight: number;
  nextHeight: number;
}): { scrollTop: number; compensated: boolean } {
  if (input.following) {
    return {
      scrollTop: input.previousScrollTop + Math.max(0, input.nextHeight - input.previousHeight),
      compensated: true,
    };
  }
  return { scrollTop: input.previousScrollTop, compensated: false };
}

export type ViewportLockGate = "preview" | "desktop";

export function viewportLockAllowed(gate: ViewportLockGate): boolean {
  return gate === "preview";
}
