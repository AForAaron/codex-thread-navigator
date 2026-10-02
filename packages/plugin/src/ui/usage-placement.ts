type Rect = Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom" | "width" | "height">;

/** Keep the passive quota display above the native navigation footer. */
export function computeUsagePlacement(
  rail: Rect,
  footer: Rect,
  indicator: Pick<Rect, "width" | "height">,
  lastNavigationControlBottom: number | null,
): { left: number; top: number } | null {
  const gap = 12;
  if (![rail.left, rail.top, rail.right, rail.bottom, footer.left, footer.top, footer.right,
    footer.bottom, indicator.width, indicator.height].every(Number.isFinite)) return null;
  if (indicator.width <= 0 || indicator.height <= 0 || footer.width < indicator.width) return null;
  if (footer.left < rail.left || footer.right > rail.right || footer.bottom > rail.bottom + 2) return null;
  // The native footer is the bottom section of this rail, not an arbitrary child.
  if (rail.bottom - footer.bottom > 20) return null;
  const left = footer.left + (footer.width - indicator.width) / 2;
  const top = footer.top - gap - indicator.height;
  if (left < rail.left + 4 || left + indicator.width > rail.right - 4) return null;
  if (top < rail.top + 8 || lastNavigationControlBottom !== null && top < lastNavigationControlBottom + gap) return null;
  return { left, top };
}
