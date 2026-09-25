export interface OutlineHeading {
  id: string;
  level: 1 | 2 | 3 | 4;
  text: string;
  turnId: string;
  itemId?: string;
}

export interface HeadingLike {
  tagName: string;
  textContent: string | null;
  id?: string;
  getAttribute?(name: string): string | null;
}

/** Only explicit h1–h4. No AI segmentation. */
export function extractHeadings(
  nodes: Iterable<HeadingLike> | ArrayLike<HeadingLike>,
  turnId: string,
  itemId?: string,
): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  let i = 0;
  for (const node of Array.from(nodes)) {
    const tag = node.tagName.toLowerCase();
    if (!/^h[1-4]$/.test(tag)) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const attrId = node.id || node.getAttribute?.("id") || "";
    out.push({
      id: attrId || `${turnId}-h${tag.slice(1)}-${i}`,
      level: Number(tag.slice(1)) as 1 | 2 | 3 | 4,
      text,
      turnId,
      itemId,
    });
    i += 1;
  }
  return out;
}
